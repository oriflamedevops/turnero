-- ================================================================
-- Turnero — Schema y funciones PostgreSQL para Supabase
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- ================================================================

-- ── Tablas ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agents (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  code       TEXT NOT NULL UNIQUE,
  pin        TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ratings (
  id         SERIAL PRIMARY KEY,
  agent_id   INTEGER NOT NULL REFERENCES agents(id),
  score      INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ratings_agent_id   ON ratings(agent_id);
CREATE INDEX IF NOT EXISTS idx_ratings_created_at ON ratings(created_at);

-- Permisos para el rol anon (clave publicable)
ALTER TABLE agents DISABLE ROW LEVEL SECURITY;
ALTER TABLE ratings DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON agents TO anon;
GRANT SELECT, INSERT         ON ratings TO anon;
GRANT USAGE ON SEQUENCE agents_id_seq  TO anon;
GRANT USAGE ON SEQUENCE ratings_id_seq TO anon;


-- ── Función: agentes con estadísticas (panel admin) ─────────────

CREATE OR REPLACE FUNCTION fn_agents_all()
RETURNS TABLE(
  id int, name text, code text, active int, created_at timestamptz,
  has_pin int, total_ratings int, avg_score float8
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT a.id::int, a.name, a.code, a.active::int, a.created_at,
    (CASE WHEN a.pin IS NOT NULL AND a.pin != '' THEN 1 ELSE 0 END)::int,
    COUNT(r.id)::int,
    ROUND(AVG(r.score)::numeric, 2)::float8
  FROM agents a
  LEFT JOIN ratings r ON r.agent_id = a.id
  GROUP BY a.id, a.name, a.code, a.active, a.created_at
  ORDER BY a.name;
$$;


-- ── Función: resumen del dashboard ──────────────────────────────

CREATE OR REPLACE FUNCTION fn_reports_summary(
  p_from text DEFAULT NULL,
  p_to   text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_from     TIMESTAMPTZ;
  v_to       TIMESTAMPTZ;
  v_midpoint TIMESTAMPTZ;
BEGIN
  v_from := CASE WHEN p_from IS NOT NULL THEN p_from::timestamptz END;
  v_to   := CASE WHEN p_to   IS NOT NULL THEN (p_to || 'T23:59:59Z')::timestamptz END;

  -- Punto medio del período filtrado para calcular tendencia
  IF v_from IS NOT NULL OR v_to IS NOT NULL THEN
    SELECT COALESCE(v_from, MIN(created_at))
           + (COALESCE(v_to, MAX(created_at)) - COALESCE(v_from, MIN(created_at))) / 2.0
    INTO v_midpoint
    FROM ratings
    WHERE (v_from IS NULL OR created_at >= v_from)
      AND (v_to   IS NULL OR created_at <= v_to);
  END IF;

  RETURN (
    SELECT json_build_object(
      'overall', (
        SELECT json_build_object(
          'total',     COUNT(*)::int,
          'avg_score', ROUND(AVG(score)::numeric, 2)::float8
        )
        FROM ratings
        WHERE (v_from IS NULL OR created_at >= v_from)
          AND (v_to   IS NULL OR created_at <= v_to)
      ),
      'agents', COALESCE((
        SELECT json_agg(
          json_build_object(
            'id',            pa.id,
            'name',          pa.name,
            'code',          pa.code,
            'active',        pa.active,
            'total_ratings', pa.total_ratings,
            'avg_score',     pa.avg_score,
            'last_rating',   pa.last_rating,
            'trend', CASE
              WHEN t.recent_avg > t.prior_avg THEN 'up'
              WHEN t.recent_avg < t.prior_avg THEN 'down'
              ELSE 'stable'
            END
          )
          ORDER BY pa.avg_score DESC NULLS LAST
        )
        FROM (
          SELECT a.id, a.name, a.code, a.active::int,
                 COUNT(r.id)::int                         AS total_ratings,
                 ROUND(AVG(r.score)::numeric, 2)::float8  AS avg_score,
                 MAX(r.created_at)                        AS last_rating
          FROM agents a
          LEFT JOIN ratings r ON r.agent_id = a.id
            AND (v_from IS NULL OR r.created_at >= v_from)
            AND (v_to   IS NULL OR r.created_at <= v_to)
          GROUP BY a.id, a.name, a.code, a.active
        ) pa
        LEFT JOIN (
          SELECT agent_id,
            ROUND(AVG(CASE
              WHEN v_midpoint IS NOT NULL AND created_at >= v_midpoint THEN score
              WHEN v_midpoint IS NULL AND created_at >= NOW() - INTERVAL '7 days' THEN score
            END)::numeric, 2)::float8 AS recent_avg,
            ROUND(AVG(CASE
              WHEN v_midpoint IS NOT NULL AND created_at < v_midpoint THEN score
              WHEN v_midpoint IS NULL
                   AND created_at >= NOW() - INTERVAL '14 days'
                   AND created_at <  NOW() - INTERVAL '7 days'  THEN score
            END)::numeric, 2)::float8 AS prior_avg
          FROM ratings
          WHERE v_midpoint IS NULL
             OR ((v_from IS NULL OR created_at >= v_from)
                 AND (v_to IS NULL OR created_at <= v_to))
          GROUP BY agent_id
        ) t ON t.agent_id = pa.id
      ), '[]'::json)
    )
  );
END;
$$;


-- ── Función: distribución de puntuaciones ───────────────────────

CREATE OR REPLACE FUNCTION fn_reports_distribution(
  p_agent_id int  DEFAULT NULL,
  p_from     text DEFAULT NULL,
  p_to       text DEFAULT NULL
)
RETURNS json
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT json_agg(t ORDER BY t.score)
  FROM (
    SELECT s.score::int AS score, COUNT(r.id)::int AS count
    FROM generate_series(1, 5) AS s(score)
    LEFT JOIN ratings r ON r.score = s.score
      AND (p_agent_id IS NULL OR r.agent_id = p_agent_id)
      AND (p_from IS NULL OR r.created_at >= p_from::timestamptz)
      AND (p_to   IS NULL OR r.created_at <= (p_to || 'T23:59:59Z')::timestamptz)
    GROUP BY s.score
  ) t;
$$;


-- ── Función: tendencia histórica (gráfica) ───────────────────────

CREATE OR REPLACE FUNCTION fn_reports_trend(
  p_agent_id    int  DEFAULT NULL,
  p_granularity text DEFAULT 'day',
  p_from        text DEFAULT NULL,
  p_to          text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_fmt text;
BEGIN
  v_fmt := CASE p_granularity
    WHEN 'week'  THEN 'IYYY-"W"IW'
    WHEN 'month' THEN 'YYYY-MM'
    ELSE              'YYYY-MM-DD'
  END;

  RETURN (
    SELECT COALESCE(json_agg(t ORDER BY t.period), '[]'::json)
    FROM (
      SELECT TO_CHAR(created_at AT TIME ZONE 'UTC', v_fmt)   AS period,
             ROUND(AVG(score)::numeric, 2)::float8            AS avg_score,
             COUNT(*)::int                                     AS count
      FROM ratings
      WHERE (p_agent_id IS NULL OR agent_id = p_agent_id)
        AND (p_from IS NULL OR created_at >= p_from::timestamptz)
        AND (p_to   IS NULL OR created_at <= (p_to || 'T23:59:59Z')::timestamptz)
      GROUP BY 1
    ) t
  );
END;
$$;


-- ── Función: calificaciones paginadas (admin) ────────────────────

CREATE OR REPLACE FUNCTION fn_ratings_paged(
  p_agent_id int  DEFAULT NULL,
  p_from     text DEFAULT NULL,
  p_to       text DEFAULT NULL,
  p_page     int  DEFAULT 1
)
RETURNS json
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  WITH filtered AS (
    SELECT r.id, r.score, r.comment, r.created_at,
           a.name AS agent_name, a.code AS agent_code
    FROM ratings r
    JOIN agents a ON a.id = r.agent_id
    WHERE (p_agent_id IS NULL OR r.agent_id = p_agent_id)
      AND (p_from IS NULL OR r.created_at >= p_from::timestamptz)
      AND (p_to   IS NULL OR r.created_at <= (p_to || 'T23:59:59Z')::timestamptz)
  )
  SELECT json_build_object(
    'data', COALESCE((
      SELECT json_agg(t)
      FROM (SELECT * FROM filtered ORDER BY created_at DESC LIMIT 50 OFFSET ((p_page - 1) * 50)) t
    ), '[]'::json),
    'total', (SELECT COUNT(*)::int FROM filtered),
    'page',  p_page,
    'pages', GREATEST(CEIL((SELECT COUNT(*)::float FROM filtered) / 50)::int, 1)
  );
$$;


-- ── Función: exportar a CSV ──────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_reports_export(
  p_agent_id int  DEFAULT NULL,
  p_from     text DEFAULT NULL,
  p_to       text DEFAULT NULL
)
RETURNS json
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(json_agg(t ORDER BY t.fecha DESC), '[]'::json)
  FROM (
    SELECT r.id, a.code AS agente_codigo, a.name AS agente_nombre,
           r.score AS calificacion, r.comment AS comentario, r.created_at AS fecha
    FROM ratings r
    JOIN agents a ON a.id = r.agent_id
    WHERE (p_agent_id IS NULL OR r.agent_id = p_agent_id)
      AND (p_from IS NULL OR r.created_at >= p_from::timestamptz)
      AND (p_to   IS NULL OR r.created_at <= (p_to || 'T23:59:59Z')::timestamptz)
  ) t;
$$;


-- ── Permisos para llamar las funciones vía clave anon ────────────

GRANT EXECUTE ON FUNCTION fn_agents_all()                             TO anon;
GRANT EXECUTE ON FUNCTION fn_reports_summary(text, text)              TO anon;
GRANT EXECUTE ON FUNCTION fn_reports_distribution(int, text, text)    TO anon;
GRANT EXECUTE ON FUNCTION fn_reports_trend(int, text, text, text)     TO anon;
GRANT EXECUTE ON FUNCTION fn_ratings_paged(int, text, text, int)      TO anon;
GRANT EXECUTE ON FUNCTION fn_reports_export(int, text, text)          TO anon;
