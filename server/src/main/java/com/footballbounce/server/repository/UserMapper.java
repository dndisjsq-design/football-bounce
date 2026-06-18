package com.footballbounce.server.repository;

import com.footballbounce.server.domain.UserAccount;
import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface UserMapper {

    @Select("""
            SELECT id,
                   username,
                   password_hash AS passwordHash,
                   display_name AS displayName,
                   avatar_url AS avatarUrl,
                   coins,
                   single_total_matches AS singleTotalMatches,
                   single_win_matches AS singleWinMatches,
                   online_total_matches AS onlineTotalMatches,
                   online_win_matches AS onlineWinMatches,
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
                   single_total_matches AS singleTotalMatches,
                   single_win_matches AS singleWinMatches,
                   online_total_matches AS onlineTotalMatches,
                   online_win_matches AS onlineWinMatches,
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

    @Select("""
            SELECT template_key AS templateKey,
                   username,
                   display_name AS displayName,
                   avatar_url AS avatarUrl,
                   coins,
                   player_policy AS playerPolicy,
                   formation_policy AS formationPolicy,
                   selected_formation_id AS selectedFormationId
            FROM guest_account_template
            WHERE template_key = 'default'
            LIMIT 1
            """)
    Map<String, Object> findGuestTemplate();

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

    @Update("""
            UPDATE user_account
            SET coins = coins - #{amount},
                updated_at = NOW(6)
            WHERE id = #{userId}
              AND coins >= #{amount}
            """)
    int deductCoinsIfEnough(@Param("userId") Long userId, @Param("amount") Integer amount);

    @Update("""
            UPDATE user_account
            SET coins = coins + #{amount},
                updated_at = NOW(6)
            WHERE id = #{userId}
            """)
    int addCoins(@Param("userId") Long userId, @Param("amount") Integer amount);

    @Update("""
            UPDATE user_account
            SET single_total_matches = single_total_matches + 1,
                single_win_matches = single_win_matches + #{winCount},
                updated_at = NOW(6)
            WHERE id = #{userId}
            """)
    int incrementSingleMatchStats(@Param("userId") Long userId, @Param("winCount") Integer winCount);

    @Update("""
            UPDATE user_account
            SET online_total_matches = online_total_matches + 1,
                online_win_matches = online_win_matches + #{winCount},
                updated_at = NOW(6)
            WHERE id = #{userId}
            """)
    int incrementOnlineMatchStats(@Param("userId") Long userId, @Param("winCount") Integer winCount);

    @Update("""
            UPDATE user_account u
            INNER JOIN guest_account_template t ON t.template_key = 'default'
            SET u.username = t.username,
                u.display_name = t.display_name,
                u.avatar_url = t.avatar_url,
                u.coins = t.coins,
                u.single_total_matches = 0,
                u.single_win_matches = 0,
                u.online_total_matches = 0,
                u.online_win_matches = 0,
                u.updated_at = NOW(6)
            WHERE u.id = #{userId}
            """)
    int resetGuestFromTemplate(@Param("userId") Long userId);
}
