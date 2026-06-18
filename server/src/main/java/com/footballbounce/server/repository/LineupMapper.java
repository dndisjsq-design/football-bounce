package com.footballbounce.server.repository;

import com.footballbounce.server.domain.PlayerData;
import com.footballbounce.server.domain.UserLineup;
import java.util.List;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface LineupMapper {
    @Insert("""
            INSERT INTO player_data (
                player_id, name, score, rarity, avatar_seed, intro, body_type, nationality, club,
                height, weight, age, skills, power, accuracy, curve, stamina, body_strength,
                created_at, updated_at
            ) VALUES (
                #{player.playerId}, #{player.name}, #{player.score}, #{player.rarity}, #{player.avatarSeed},
                #{player.intro}, #{player.bodyType}, #{player.nationality}, #{player.club},
                #{player.height}, #{player.weight}, #{player.age}, #{player.skills}, #{player.power},
                #{player.accuracy}, #{player.curve}, #{player.stamina}, #{player.bodyStrength},
                NOW(6), NOW(6)
            )
            ON DUPLICATE KEY UPDATE
                name = VALUES(name), score = VALUES(score), rarity = VALUES(rarity), avatar_seed = VALUES(avatar_seed),
                intro = VALUES(intro), body_type = VALUES(body_type), nationality = VALUES(nationality), club = VALUES(club),
                height = VALUES(height), weight = VALUES(weight), age = VALUES(age), skills = VALUES(skills),
                power = VALUES(power), accuracy = VALUES(accuracy), curve = VALUES(curve), stamina = VALUES(stamina),
                body_strength = VALUES(body_strength), updated_at = NOW(6)
            """)
    int upsertPlayerData(@Param("player") PlayerData player);

    @Insert("""
            INSERT IGNORE INTO user_owned_player (user_id, player_id, created_at)
            VALUES (#{userId}, #{playerId}, NOW(6))
            """)
    int insertOwnedPlayerIfAbsent(@Param("userId") Long userId, @Param("playerId") String playerId);

    @Select("""
            SELECT COUNT(*)
            FROM user_owned_player
            WHERE user_id = #{userId}
              AND player_id = #{playerId}
            """)
    int countOwnedPlayer(@Param("userId") Long userId, @Param("playerId") String playerId);

    @Insert("""
            INSERT IGNORE INTO user_owned_player (user_id, player_id, created_at)
            SELECT #{userId}, player_id, NOW(6)
            FROM player_data
            WHERE rarity = #{rarity}
            """)
    int insertOwnedPlayersByRarity(@Param("userId") Long userId, @Param("rarity") String rarity);

    @Insert("""
            INSERT IGNORE INTO user_owned_player (user_id, player_id, created_at)
            SELECT #{userId}, player_id, NOW(6)
            FROM player_data
            """)
    int insertOwnedAllPlayers(@Param("userId") Long userId);

    @Insert("""
            INSERT IGNORE INTO user_owned_formation (user_id, formation_id, sort_order, created_at)
            VALUES (#{userId}, #{formationId}, #{sortOrder}, NOW(6))
            """)
    int insertOwnedFormationIfAbsent(@Param("userId") Long userId, @Param("formationId") String formationId, @Param("sortOrder") Integer sortOrder);

    @Select("""
            SELECT COUNT(*)
            FROM user_owned_formation
            WHERE user_id = #{userId}
              AND formation_id = #{formationId}
            """)
    int countOwnedFormation(@Param("userId") Long userId, @Param("formationId") String formationId);

    @Insert("""
            INSERT INTO user_lineup (
                user_id, selected_formation_id, slot_1_player_id, slot_2_player_id, slot_3_player_id,
                slot_4_player_id, slot_5_player_id, created_at, updated_at
            ) VALUES (
                #{lineup.userId}, #{lineup.selectedFormationId}, #{lineup.slot1PlayerId}, #{lineup.slot2PlayerId},
                #{lineup.slot3PlayerId}, #{lineup.slot4PlayerId}, #{lineup.slot5PlayerId}, NOW(6), NOW(6)
            )
            ON DUPLICATE KEY UPDATE
                selected_formation_id = VALUES(selected_formation_id),
                slot_1_player_id = VALUES(slot_1_player_id),
                slot_2_player_id = VALUES(slot_2_player_id),
                slot_3_player_id = VALUES(slot_3_player_id),
                slot_4_player_id = VALUES(slot_4_player_id),
                slot_5_player_id = VALUES(slot_5_player_id),
                updated_at = NOW(6)
            """)
    int upsertLineup(@Param("lineup") UserLineup lineup);

    @Delete("""
            DELETE FROM user_owned_player
            WHERE user_id = #{userId}
            """)
    int deleteOwnedPlayers(@Param("userId") Long userId);

    @Delete("""
            DELETE FROM user_owned_formation
            WHERE user_id = #{userId}
            """)
    int deleteOwnedFormations(@Param("userId") Long userId);

    @Delete("""
            DELETE FROM user_lineup
            WHERE user_id = #{userId}
            """)
    int deleteLineup(@Param("userId") Long userId);

    @Select("""
            SELECT p.player_id AS playerId, p.name, p.score, p.rarity, p.avatar_seed AS avatarSeed,
                   p.intro, p.body_type AS bodyType, p.nationality, p.club, p.height, p.weight, p.age,
                   p.skills, p.power, p.accuracy, p.curve, p.stamina, p.body_strength AS bodyStrength
            FROM user_owned_player up
            INNER JOIN player_data p ON p.player_id = up.player_id
            WHERE up.user_id = #{userId}
            ORDER BY CASE p.rarity WHEN 'red' THEN 0 WHEN 'orange' THEN 1 WHEN 'purple' THEN 2 ELSE 3 END,
                     p.score DESC,
                     p.player_id ASC
            """)
    List<PlayerData> findOwnedPlayers(@Param("userId") Long userId);

    @Select("""
            SELECT p.player_id
            FROM user_owned_player up
            INNER JOIN player_data p ON p.player_id = up.player_id
            WHERE up.user_id = #{userId}
            ORDER BY CASE p.rarity WHEN 'red' THEN 0 WHEN 'orange' THEN 1 WHEN 'purple' THEN 2 ELSE 3 END,
                     p.score DESC,
                     p.player_id ASC
            LIMIT #{limit}
            """)
    List<String> findTopOwnedPlayerIds(@Param("userId") Long userId, @Param("limit") int limit);

    @Select("""
            SELECT p.player_id AS playerId, p.name, p.score, p.rarity, p.avatar_seed AS avatarSeed,
                   p.intro, p.body_type AS bodyType, p.nationality, p.club, p.height, p.weight, p.age,
                   p.skills, p.power, p.accuracy, p.curve, p.stamina, p.body_strength AS bodyStrength
            FROM player_data p
            ORDER BY CASE p.rarity WHEN 'red' THEN 0 WHEN 'orange' THEN 1 WHEN 'purple' THEN 2 ELSE 3 END,
                     p.score DESC,
                     p.player_id ASC
            """)
    List<PlayerData> findAllPlayers();

    @Select("""
            SELECT p.player_id AS playerId, p.name, p.score, p.rarity, p.avatar_seed AS avatarSeed,
                   p.intro, p.body_type AS bodyType, p.nationality, p.club, p.height, p.weight, p.age,
                   p.skills, p.power, p.accuracy, p.curve, p.stamina, p.body_strength AS bodyStrength
            FROM player_data p
            WHERE p.player_id = #{playerId}
            LIMIT 1
            """)
    PlayerData findPlayerById(@Param("playerId") String playerId);

    @Select("""
            SELECT formation_id
            FROM user_owned_formation
            WHERE user_id = #{userId}
            ORDER BY sort_order ASC, formation_id ASC
            """)
    List<String> findOwnedFormationIds(@Param("userId") Long userId);

    @Select("""
            SELECT user_id AS userId,
                   selected_formation_id AS selectedFormationId,
                   slot_1_player_id AS slot1PlayerId,
                   slot_2_player_id AS slot2PlayerId,
                   slot_3_player_id AS slot3PlayerId,
                   slot_4_player_id AS slot4PlayerId,
                   slot_5_player_id AS slot5PlayerId
            FROM user_lineup
            WHERE user_id = #{userId}
            LIMIT 1
            """)
    UserLineup findLineup(@Param("userId") Long userId);
}
