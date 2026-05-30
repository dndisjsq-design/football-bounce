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
