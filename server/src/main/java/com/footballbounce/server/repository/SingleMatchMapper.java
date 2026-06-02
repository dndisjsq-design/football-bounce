package com.footballbounce.server.repository;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface SingleMatchMapper {

    @Select("""
            SELECT id,
                   username,
                   display_name AS displayName
            FROM user_account
            WHERE id = #{userId}
            LIMIT 1
            """)
    Map<String, Object> findUser(@Param("userId") Long userId);

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
    Map<String, Object> findUserLineup(@Param("userId") Long userId);

    @Select("""
            <script>
            SELECT player_id AS id,
                   name,
                   score,
                   rarity,
                   avatar_seed AS avatarSeed
            FROM player_data
            WHERE player_id IN
              <foreach collection="ids" item="id" open="(" separator="," close=")">
                #{id}
              </foreach>
            </script>
            """)
    List<Map<String, Object>> findPlayersByIds(@Param("ids") List<String> ids);

    @Insert("""
            INSERT INTO user_match_record (
                match_no,
                user_id,
                username,
                user_side,
                client_session_id,
                match_time,
                match_type,
                duration_seconds,
                opponent_user_id,
                opponent_username,
                result_score,
                result,
                home_formation_id,
                away_formation_id,
                home_lineup_player_ids,
                away_lineup_player_ids,
                created_at,
                updated_at
            ) VALUES (
                #{matchNo},
                #{userId},
                #{username},
                #{userSide},
                #{clientSessionId},
                NOW(6),
                #{matchType},
                0,
                #{opponentUserId},
                #{opponentUsername},
                NULL,
                NULL,
                #{homeFormationId},
                #{awayFormationId},
                #{homeLineupPlayerIds},
                #{awayLineupPlayerIds},
                NOW(6),
                NOW(6)
            )
            """)
    int insertMatchRecord(
            @Param("matchNo") String matchNo,
            @Param("userId") Long userId,
            @Param("username") String username,
            @Param("userSide") String userSide,
            @Param("clientSessionId") String clientSessionId,
            @Param("matchType") String matchType,
            @Param("opponentUserId") Long opponentUserId,
            @Param("opponentUsername") String opponentUsername,
            @Param("homeFormationId") String homeFormationId,
            @Param("awayFormationId") String awayFormationId,
            @Param("homeLineupPlayerIds") String homeLineupPlayerIds,
            @Param("awayLineupPlayerIds") String awayLineupPlayerIds
    );

    @Insert("""
            INSERT INTO match_action (
                match_no,
                action_index,
                actor_user_id,
                actor_side,
                actor_id,
                action_type,
                command_json,
                valid_result,
                validation_message,
                created_at
            ) VALUES (
                #{matchNo},
                #{actionIndex},
                #{actorUserId},
                #{actorSide},
                #{actorId},
                #{actionType},
                #{commandJson},
                #{validResult},
                #{validationMessage},
                NOW(6)
            )
            """)
    int insertAction(
            @Param("matchNo") String matchNo,
            @Param("actionIndex") int actionIndex,
            @Param("actorUserId") Long actorUserId,
            @Param("actorSide") String actorSide,
            @Param("actorId") String actorId,
            @Param("actionType") String actionType,
            @Param("commandJson") String commandJson,
            @Param("validResult") Boolean validResult,
            @Param("validationMessage") String validationMessage
    );

    @Insert("""
            INSERT INTO match_goal_record (
                match_no,
                goal_order,
                match_second,
                user_id,
                username,
                side,
                actor_id,
                player_id,
                player_name,
                is_penalty,
                is_own_goal,
                created_at
            ) VALUES (
                #{matchNo},
                #{goalOrder},
                #{matchSecond},
                #{userId},
                #{username},
                #{side},
                #{actorId},
                #{playerId},
                #{playerName},
                #{penalty},
                #{ownGoal},
                NOW(6)
            )
            """)
    int insertGoal(
            @Param("matchNo") String matchNo,
            @Param("goalOrder") int goalOrder,
            @Param("matchSecond") int matchSecond,
            @Param("userId") long userId,
            @Param("username") String username,
            @Param("side") String side,
            @Param("actorId") String actorId,
            @Param("playerId") String playerId,
            @Param("playerName") String playerName,
            @Param("penalty") boolean penalty,
            @Param("ownGoal") boolean ownGoal
    );

    @Update("""
            UPDATE user_match_record
            SET duration_seconds = #{durationSeconds},
                result_score = #{resultScore},
                result = #{result},
                updated_at = NOW(6)
            WHERE match_no = #{matchNo}
              AND user_id = #{userId}
            """)
    int finishMatch(
            @Param("matchNo") String matchNo,
            @Param("userId") Long userId,
            @Param("durationSeconds") int durationSeconds,
            @Param("resultScore") String resultScore,
            @Param("result") String result
    );

    @Select("""
            SELECT COUNT(1)
            FROM user_match_record
            WHERE match_no = #{matchNo}
              AND user_id = #{userId}
              AND result IS NULL
            """)
    int countUnfinishedMatch(@Param("matchNo") String matchNo, @Param("userId") Long userId);

    @Delete("""
            DELETE FROM match_goal_record
            WHERE match_no = #{matchNo}
            """)
    int deleteGoalsByMatchNo(@Param("matchNo") String matchNo);

    @Delete("""
            DELETE FROM match_action
            WHERE match_no = #{matchNo}
            """)
    int deleteActionsByMatchNo(@Param("matchNo") String matchNo);

    @Delete("""
            DELETE FROM user_match_record
            WHERE match_no = #{matchNo}
              AND user_id = #{userId}
              AND result IS NULL
            """)
    int deleteUnfinishedMatchRecord(@Param("matchNo") String matchNo, @Param("userId") Long userId);
}
