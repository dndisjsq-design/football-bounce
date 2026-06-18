package com.footballbounce.server.repository;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface MatchRecordMapper {

    @Select("""
            <script>
            SELECT match_no AS matchId,
                   DATE_FORMAT(match_time, '%Y-%m-%d %H:%i:%s') AS matchTime,
                   match_type AS matchType,
                   duration_seconds AS durationSeconds,
                   user_id AS userId,
                   username,
                   user_side AS userSide,
                   opponent_user_id AS opponentUserId,
                   opponent_username AS opponentUsername,
                   result_score AS resultScore,
                   result,
                   home_formation_id AS homeFormationId,
                   away_formation_id AS awayFormationId,
                   home_lineup_player_ids AS homeLineupPlayerIds,
                   away_lineup_player_ids AS awayLineupPlayerIds
            FROM user_match_record
            WHERE user_id = #{userId}
              AND result IS NOT NULL
              <if test="guestOnly">
                AND client_session_id = #{guestSessionId}
              </if>
            ORDER BY match_time DESC
            LIMIT #{limit}
            </script>
            """)
    List<Map<String, Object>> findRecentRecords(
            @Param("userId") long userId,
            @Param("guestOnly") boolean guestOnly,
            @Param("guestSessionId") String guestSessionId,
            @Param("limit") int limit
    );

    @Select("""
            <script>
            SELECT match_no AS matchId,
                   DATE_FORMAT(match_time, '%Y-%m-%d %H:%i:%s') AS matchTime,
                   match_type AS matchType,
                   duration_seconds AS durationSeconds,
                   user_id AS userId,
                   username,
                   user_side AS userSide,
                   opponent_user_id AS opponentUserId,
                   opponent_username AS opponentUsername,
                   result_score AS resultScore,
                   result,
                   home_formation_id AS homeFormationId,
                   away_formation_id AS awayFormationId,
                   home_lineup_player_ids AS homeLineupPlayerIds,
                   away_lineup_player_ids AS awayLineupPlayerIds
            FROM user_match_record
            WHERE match_no = #{matchNo}
              AND user_id = #{userId}
              AND result IS NOT NULL
              <if test="guestOnly">
                AND client_session_id = #{guestSessionId}
              </if>
            LIMIT 1
            </script>
            """)
    Map<String, Object> findOwnedFinishedRecord(
            @Param("matchNo") String matchNo,
            @Param("userId") long userId,
            @Param("guestOnly") boolean guestOnly,
            @Param("guestSessionId") String guestSessionId
    );

    @Select("""
            SELECT action_index AS actionIndex,
                   actor_user_id AS actorUserId,
                   actor_side AS actorSide,
                   actor_id AS actorId,
                   action_type AS actionType,
                   command_json AS commandJson,
                   valid_result AS validResult,
                   validation_message AS validationMessage,
                   DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS createdAt
            FROM match_action
            WHERE match_no = #{matchNo}
            ORDER BY action_index ASC
            """)
    List<Map<String, Object>> findActions(@Param("matchNo") String matchNo);

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

    @Delete("""
            DELETE FROM match_goal_record
            WHERE match_no IN (
                SELECT match_no
                FROM user_match_record
                WHERE user_id = #{userId}
                  AND client_session_id = #{guestSessionId}
            )
            """)
    int deleteGuestGoals(@Param("userId") long userId, @Param("guestSessionId") String guestSessionId);

    @Delete("""
            DELETE FROM match_goal_record
            WHERE match_no IN (
                SELECT match_no
                FROM user_match_record
                WHERE user_id = #{userId}
            )
            """)
    int deleteAllGuestGoals(@Param("userId") long userId);

    @Delete("""
            DELETE FROM match_action
            WHERE match_no IN (
                SELECT match_no
                FROM user_match_record
                WHERE user_id = #{userId}
                  AND client_session_id = #{guestSessionId}
            )
            """)
    int deleteGuestActions(@Param("userId") long userId, @Param("guestSessionId") String guestSessionId);

    @Delete("""
            DELETE FROM match_action
            WHERE match_no IN (
                SELECT match_no
                FROM user_match_record
                WHERE user_id = #{userId}
            )
            """)
    int deleteAllGuestActions(@Param("userId") long userId);

    @Delete("""
            DELETE FROM user_match_record
            WHERE user_id = #{userId}
              AND client_session_id = #{guestSessionId}
            """)
    int deleteGuestRecords(@Param("userId") long userId, @Param("guestSessionId") String guestSessionId);

    @Delete("""
            DELETE FROM user_match_record
            WHERE user_id = #{userId}
            """)
    int deleteAllGuestRecords(@Param("userId") long userId);
}
