package com.footballbounce.server.repository;

import com.footballbounce.server.domain.UserLoginSession;
import java.time.LocalDateTime;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface UserLoginSessionMapper {

    @Insert("""
            INSERT INTO user_login_session (
                user_id,
                device_id,
                client_instance_id,
                token_hash,
                expires_at,
                last_used_at,
                revoked_at,
                created_at,
                updated_at
            ) VALUES (
                #{userId},
                #{deviceId},
                #{clientInstanceId},
                #{tokenHash},
                #{expiresAt},
                NOW(6),
                NULL,
                NOW(6),
                NOW(6)
            )
            ON DUPLICATE KEY UPDATE
                token_hash = VALUES(token_hash),
                client_instance_id = VALUES(client_instance_id),
                expires_at = VALUES(expires_at),
                last_used_at = NOW(6),
                revoked_at = NULL,
                updated_at = NOW(6)
            """)
    int upsert(
            @Param("userId") Long userId,
            @Param("deviceId") String deviceId,
            @Param("clientInstanceId") String clientInstanceId,
            @Param("tokenHash") String tokenHash,
            @Param("expiresAt") LocalDateTime expiresAt
    );

    @Select("""
            SELECT id,
                   user_id AS userId,
                   device_id AS deviceId,
                   client_instance_id AS clientInstanceId,
                   token_hash AS tokenHash,
                   expires_at AS expiresAt,
                   last_used_at AS lastUsedAt,
                   revoked_at AS revokedAt,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM user_login_session
            WHERE device_id = #{deviceId}
              AND token_hash = #{tokenHash}
              AND revoked_at IS NULL
              AND expires_at > NOW(6)
            LIMIT 1
            """)
    UserLoginSession findActive(
            @Param("deviceId") String deviceId,
            @Param("tokenHash") String tokenHash
    );

    @Select("""
            SELECT id,
                   user_id AS userId,
                   device_id AS deviceId,
                   client_instance_id AS clientInstanceId,
                   token_hash AS tokenHash,
                   expires_at AS expiresAt,
                   last_used_at AS lastUsedAt,
                   revoked_at AS revokedAt,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM user_login_session
            WHERE device_id = #{deviceId}
              AND token_hash = #{tokenHash}
              AND client_instance_id = #{clientInstanceId}
              AND revoked_at IS NULL
              AND expires_at > NOW(6)
            LIMIT 1
            """)
    UserLoginSession findActiveForInstance(
            @Param("deviceId") String deviceId,
            @Param("tokenHash") String tokenHash,
            @Param("clientInstanceId") String clientInstanceId
    );

    @Update("""
            UPDATE user_login_session
            SET last_used_at = NOW(6),
                updated_at = NOW(6)
            WHERE id = #{id}
            """)
    int touch(@Param("id") Long id);

    @Update("""
            UPDATE user_login_session
            SET client_instance_id = #{clientInstanceId},
                last_used_at = NOW(6),
                updated_at = NOW(6)
            WHERE id = #{id}
            """)
    int bindClientInstance(@Param("id") Long id, @Param("clientInstanceId") String clientInstanceId);

    @Update("""
            UPDATE user_login_session
            SET revoked_at = NOW(6),
                updated_at = NOW(6)
            WHERE user_id = #{userId}
              AND device_id <> #{keepDeviceId}
              AND revoked_at IS NULL
            """)
    int revokeOtherActiveSessions(
            @Param("userId") Long userId,
            @Param("keepDeviceId") String keepDeviceId
    );

    @Update("""
            UPDATE user_login_session
            SET revoked_at = NOW(6),
                updated_at = NOW(6)
            WHERE device_id = #{deviceId}
              AND token_hash = #{tokenHash}
              AND client_instance_id = #{clientInstanceId}
              AND revoked_at IS NULL
            """)
    int revoke(
            @Param("deviceId") String deviceId,
            @Param("tokenHash") String tokenHash,
            @Param("clientInstanceId") String clientInstanceId
    );
}
