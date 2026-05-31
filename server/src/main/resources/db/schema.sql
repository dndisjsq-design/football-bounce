CREATE DATABASE IF NOT EXISTS football_bounce
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE football_bounce;

CREATE TABLE IF NOT EXISTS user_account (
  id BIGINT NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  display_name VARCHAR(64) NOT NULL,
  avatar_url VARCHAR(255) NULL,
  coins INT NOT NULL DEFAULT 6000,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_account_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO user_account (
  id,
  username,
  password_hash,
  display_name,
  avatar_url,
  coins,
  created_at,
  updated_at
) VALUES (
  1,
  'guest',
  '$2a$10$7EqJtq98hPqEX7fNZaFWoOhi1H.FFyyUe.0gF5SZOMwQbW1pC8iSa',
  '游客 10086',
  NULL,
  100000,
  NOW(6),
  NOW(6)
);

CREATE TABLE IF NOT EXISTS user_login_session (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  device_id VARCHAR(128) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  last_used_at DATETIME(6) NOT NULL,
  revoked_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_login_session_device (user_id, device_id),
  KEY idx_user_login_session_token (device_id, token_hash),
  CONSTRAINT fk_user_login_session_user
    FOREIGN KEY (user_id) REFERENCES user_account (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS player_data (
  player_id VARCHAR(64) NOT NULL,
  name VARCHAR(64) NOT NULL,
  score INT NOT NULL,
  rarity VARCHAR(16) NOT NULL,
  avatar_seed INT NOT NULL,
  intro VARCHAR(255) NOT NULL,
  body_type VARCHAR(32) NOT NULL,
  nationality VARCHAR(32) NOT NULL,
  club VARCHAR(64) NOT NULL,
  height INT NOT NULL,
  weight INT NOT NULL,
  age INT NOT NULL,
  skills VARCHAR(128) NOT NULL,
  power INT NOT NULL,
  accuracy INT NOT NULL,
  curve INT NOT NULL,
  stamina INT NOT NULL,
  body_strength INT NOT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (player_id),
  KEY idx_player_data_rarity_score (rarity, score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS formation_catalog (
  formation_id VARCHAR(64) NOT NULL,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(64) NOT NULL,
  description VARCHAR(255) NOT NULL,
  points_json TEXT NOT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (formation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO formation_catalog (
  formation_id,
  code,
  name,
  description,
  points_json,
  created_at,
  updated_at
) VALUES
  ('balanced-221', '2-2-1', '均衡推进', '后场稳定，前点压迫', '[{"x":-0.18,"y":-0.34},{"x":0.18,"y":-0.34},{"x":-0.16,"y":-0.22},{"x":0.16,"y":-0.22},{"x":0,"y":-0.08}]', NOW(6), NOW(6)),
  ('midfield-131', '1-3-1', '中场覆盖', '三中路封堵传球线', '[{"x":0,"y":-0.35},{"x":-0.22,"y":-0.22},{"x":0,"y":-0.22},{"x":0.22,"y":-0.22},{"x":0,"y":-0.08}]', NOW(6), NOW(6)),
  ('defense-311', '3-1-1', '后场铁壁', '三人守后区，反击直上', '[{"x":-0.23,"y":-0.35},{"x":0,"y":-0.35},{"x":0.23,"y":-0.35},{"x":0,"y":-0.21},{"x":0,"y":-0.08}]', NOW(6), NOW(6)),
  ('attack-122', '1-2-2', '双前锋', '前场双点抢二次球', '[{"x":0,"y":-0.35},{"x":-0.18,"y":-0.23},{"x":0.18,"y":-0.23},{"x":-0.16,"y":-0.08},{"x":0.16,"y":-0.08}]', NOW(6), NOW(6)),
  ('diamond-212', '2-1-2', '菱形展开', '中轴接应，边路前插', '[{"x":-0.19,"y":-0.35},{"x":0.19,"y":-0.35},{"x":0,"y":-0.22},{"x":-0.18,"y":-0.08},{"x":0.18,"y":-0.08}]', NOW(6), NOW(6))
ON DUPLICATE KEY UPDATE
  code = VALUES(code),
  name = VALUES(name),
  description = VALUES(description),
  points_json = VALUES(points_json),
  updated_at = NOW(6);

CREATE TABLE IF NOT EXISTS user_owned_player (
  user_id BIGINT NOT NULL,
  player_id VARCHAR(64) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (user_id, player_id),
  KEY idx_user_owned_player_player (player_id),
  CONSTRAINT fk_user_owned_player_user
    FOREIGN KEY (user_id) REFERENCES user_account (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_user_owned_player_player
    FOREIGN KEY (player_id) REFERENCES player_data (player_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_owned_formation (
  user_id BIGINT NOT NULL,
  formation_id VARCHAR(64) NOT NULL,
  sort_order INT NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (user_id, formation_id),
  CONSTRAINT fk_user_owned_formation_user
    FOREIGN KEY (user_id) REFERENCES user_account (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_lineup (
  user_id BIGINT NOT NULL,
  selected_formation_id VARCHAR(64) NOT NULL,
  slot_1_player_id VARCHAR(64) NOT NULL,
  slot_2_player_id VARCHAR(64) NOT NULL,
  slot_3_player_id VARCHAR(64) NOT NULL,
  slot_4_player_id VARCHAR(64) NOT NULL,
  slot_5_player_id VARCHAR(64) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_user_lineup_user
    FOREIGN KEY (user_id) REFERENCES user_account (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_user_lineup_slot_1
    FOREIGN KEY (slot_1_player_id) REFERENCES player_data (player_id),
  CONSTRAINT fk_user_lineup_slot_2
    FOREIGN KEY (slot_2_player_id) REFERENCES player_data (player_id),
  CONSTRAINT fk_user_lineup_slot_3
    FOREIGN KEY (slot_3_player_id) REFERENCES player_data (player_id),
  CONSTRAINT fk_user_lineup_slot_4
    FOREIGN KEY (slot_4_player_id) REFERENCES player_data (player_id),
  CONSTRAINT fk_user_lineup_slot_5
    FOREIGN KEY (slot_5_player_id) REFERENCES player_data (player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_match_record (
  id BIGINT NOT NULL AUTO_INCREMENT,
  match_no VARCHAR(64) NOT NULL,
  user_id BIGINT NOT NULL,
  username VARCHAR(64) NOT NULL,
  user_side VARCHAR(16) NOT NULL DEFAULT 'home',
  match_time DATETIME(6) NOT NULL,
  match_type VARCHAR(16) NOT NULL,
  duration_seconds INT NOT NULL DEFAULT 0,
  opponent_user_id BIGINT NULL,
  opponent_username VARCHAR(64) NOT NULL,
  result_score VARCHAR(32) NULL,
  result VARCHAR(16) NULL,
  home_formation_id VARCHAR(64) NOT NULL,
  away_formation_id VARCHAR(64) NOT NULL,
  home_lineup_player_ids VARCHAR(255) NOT NULL,
  away_lineup_player_ids VARCHAR(255) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_user_match_record_no (match_no),
  KEY idx_user_match_record_user_time (user_id, match_time),
  KEY idx_user_match_record_type (match_type),
  CONSTRAINT fk_user_match_record_user
    FOREIGN KEY (user_id) REFERENCES user_account (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS match_action (
  id BIGINT NOT NULL AUTO_INCREMENT,
  match_no VARCHAR(64) NOT NULL,
  action_index INT NOT NULL,
  actor_user_id BIGINT NOT NULL,
  actor_side VARCHAR(16) NOT NULL,
  actor_id VARCHAR(64) NULL,
  action_type VARCHAR(32) NOT NULL,
  command_json TEXT NULL,
  valid_result TINYINT(1) NULL,
  validation_message VARCHAR(255) NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_match_action_index (match_no, action_index),
  KEY idx_match_action_no_type (match_no, action_type),
  KEY idx_match_action_actor_user (actor_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS match_goal_record (
  id BIGINT NOT NULL AUTO_INCREMENT,
  match_no VARCHAR(64) NOT NULL,
  goal_order INT NOT NULL,
  match_second INT NOT NULL,
  user_id BIGINT NOT NULL,
  username VARCHAR(64) NOT NULL,
  side VARCHAR(16) NOT NULL,
  actor_id VARCHAR(64) NOT NULL,
  player_id VARCHAR(64) NOT NULL,
  player_name VARCHAR(64) NOT NULL,
  is_penalty TINYINT(1) NOT NULL,
  is_own_goal TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_match_goal_event (match_no, goal_order),
  KEY idx_match_goal_no_time (match_no, match_second),
  KEY idx_match_goal_user_player (user_id, player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
