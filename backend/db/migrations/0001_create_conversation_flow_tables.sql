-- Migration: create agents and conversation_sections for Omni sync

CREATE TABLE IF NOT EXISTS agents (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    omni_agent_id VARCHAR(255) NOT NULL,
    omni_api_key VARCHAR(255) NOT NULL,
    last_synced_at TIMESTAMPTZ NULL,
    sync_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    sync_error TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_sections (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    instruction TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_sections_agent_id ON conversation_sections(agent_id);
CREATE INDEX IF NOT EXISTS idx_conversation_sections_order ON conversation_sections(agent_id, display_order);
