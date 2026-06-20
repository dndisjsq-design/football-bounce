CREATE DATABASE IF NOT EXISTS football_bounce
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE football_bounce;

CREATE TABLE IF NOT EXISTS guest_account_template (
  template_key VARCHAR(32) NOT NULL,
  username VARCHAR(64) NOT NULL,
  display_name VARCHAR(64) NOT NULL,
  avatar_url VARCHAR(255) NULL,
  coins INT NOT NULL DEFAULT 100000,
  player_policy VARCHAR(32) NOT NULL DEFAULT 'blue,purple',
  formation_policy VARCHAR(32) NOT NULL DEFAULT 'default',
  selected_formation_id VARCHAR(64) NOT NULL DEFAULT 'defense-311',
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (template_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO guest_account_template (
  template_key,
  username,
  display_name,
  avatar_url,
  coins,
  player_policy,
  formation_policy,
  selected_formation_id,
  created_at,
  updated_at
) VALUES (
  'default',
  'visiter',
  'visiter',
  NULL,
  100000,
  'blue,purple',
  'default',
  'defense-311',
  NOW(6),
  NOW(6)
)
ON DUPLICATE KEY UPDATE
  username = VALUES(username),
  display_name = VALUES(display_name),
  avatar_url = VALUES(avatar_url),
  coins = VALUES(coins),
  player_policy = VALUES(player_policy),
  formation_policy = VALUES(formation_policy),
  selected_formation_id = VALUES(selected_formation_id),
  updated_at = NOW(6);

CREATE TABLE IF NOT EXISTS user_account (
  id BIGINT NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  display_name VARCHAR(64) NOT NULL,
  avatar_url VARCHAR(255) NULL,
  coins INT NOT NULL DEFAULT 6000,
  single_total_matches INT NOT NULL DEFAULT 0,
  single_win_matches INT NOT NULL DEFAULT 0,
  online_total_matches INT NOT NULL DEFAULT 0,
  online_win_matches INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_account_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @add_single_total_matches = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE user_account ADD COLUMN single_total_matches INT NOT NULL DEFAULT 0 AFTER coins',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_account'
    AND COLUMN_NAME = 'single_total_matches'
);
PREPARE stmt FROM @add_single_total_matches;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_single_win_matches = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE user_account ADD COLUMN single_win_matches INT NOT NULL DEFAULT 0 AFTER single_total_matches',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_account'
    AND COLUMN_NAME = 'single_win_matches'
);
PREPARE stmt FROM @add_single_win_matches;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_online_total_matches = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE user_account ADD COLUMN online_total_matches INT NOT NULL DEFAULT 0 AFTER single_win_matches',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_account'
    AND COLUMN_NAME = 'online_total_matches'
);
PREPARE stmt FROM @add_online_total_matches;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_online_win_matches = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE user_account ADD COLUMN online_win_matches INT NOT NULL DEFAULT 0 AFTER online_total_matches',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_account'
    AND COLUMN_NAME = 'online_win_matches'
);
PREPARE stmt FROM @add_online_win_matches;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO user_account (
  id,
  username,
  password_hash,
  display_name,
  avatar_url,
  coins,
  single_total_matches,
  single_win_matches,
  online_total_matches,
  online_win_matches,
  created_at,
  updated_at
) VALUES (
  1,
  'visiter',
  '$2a$10$7EqJtq98hPqEX7fNZaFWoOhi1H.FFyyUe.0gF5SZOMwQbW1pC8iSa',
  'visiter',
  NULL,
  100000,
  0,
  0,
  0,
  0,
  NOW(6),
  NOW(6)
);

UPDATE user_account
SET username = 'visiter',
    display_name = 'visiter',
    avatar_url = NULL,
    coins = 100000,
    single_total_matches = 0,
    single_win_matches = 0,
    online_total_matches = 0,
    online_win_matches = 0,
    updated_at = NOW(6)
WHERE id = 1;

CREATE TABLE IF NOT EXISTS user_login_session (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  device_id VARCHAR(128) NOT NULL,
  client_instance_id VARCHAR(96) NULL,
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

SET @add_client_instance_id = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE user_login_session ADD COLUMN client_instance_id VARCHAR(96) NULL AFTER device_id',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_login_session'
    AND COLUMN_NAME = 'client_instance_id'
);
PREPARE stmt FROM @add_client_instance_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

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

CREATE TABLE IF NOT EXISTS coin_transaction (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  change_amount INT NOT NULL,
  balance_after INT NOT NULL,
  reason VARCHAR(64) NOT NULL,
  related_id VARCHAR(128) NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_coin_transaction_user_time (user_id, created_at),
  KEY idx_coin_transaction_reason (reason),
  CONSTRAINT fk_coin_transaction_user
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
  client_session_id VARCHAR(96) NULL,
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
  KEY idx_user_match_record_match_time (match_time),
  KEY idx_user_match_record_user_time (user_id, match_time),
  KEY idx_user_match_record_session (user_id, client_session_id, match_time),
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

SET @add_user_match_record_match_time_index = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE user_match_record ADD INDEX idx_user_match_record_match_time (match_time)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_match_record'
    AND INDEX_NAME = 'idx_user_match_record_match_time'
);
PREPARE stmt FROM @add_user_match_record_match_time_index;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
