package com.footballbounce.server.repository;

import com.footballbounce.server.domain.UserAccount;
import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface UserMapper {

    @Select("""
            SELECT id,
                   username,
                   password_hash AS passwordHash,
                   display_name AS displayName,
                   avatar_url AS avatarUrl,
                   coins,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM user_account
            WHERE username = #{username}
            LIMIT 1
            """)
    UserAccount findByUsername(@Param("username") String username);

    @Select("""
            SELECT id,
                   username,
                   password_hash AS passwordHash,
                   display_name AS displayName,
                   avatar_url AS avatarUrl,
                   coins,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM user_account
            WHERE id = #{id}
            LIMIT 1
            """)
    UserAccount findById(@Param("id") Long id);

    @Select("SELECT COUNT(*) FROM user_account WHERE username = #{username}")
    int countByUsername(@Param("username") String username);

    @Select("SELECT id FROM user_account ORDER BY id ASC")
    List<Long> findAllIds();

    @Insert("""
            INSERT INTO user_account (
                username,
                password_hash,
                display_name,
                avatar_url,
                coins,
                created_at,
                updated_at
            ) VALUES (
                #{username},
                #{passwordHash},
                #{displayName},
                #{avatarUrl},
                #{coins},
                NOW(6),
                NOW(6)
            )
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(UserAccount user);
}
