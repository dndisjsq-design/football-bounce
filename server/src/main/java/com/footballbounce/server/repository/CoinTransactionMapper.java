package com.footballbounce.server.repository;

import java.time.LocalDateTime;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface CoinTransactionMapper {
    @Insert("""
            INSERT INTO coin_transaction (
                user_id,
                change_amount,
                balance_after,
                reason,
                related_id,
                created_at
            ) VALUES (
                #{userId},
                #{changeAmount},
                #{balanceAfter},
                #{reason},
                #{relatedId},
                NOW(6)
            )
            """)
    int insert(
            @Param("userId") Long userId,
            @Param("changeAmount") Integer changeAmount,
            @Param("balanceAfter") Integer balanceAfter,
            @Param("reason") String reason,
            @Param("relatedId") String relatedId
    );

    @Select("""
            SELECT COALESCE(SUM(change_amount), 0)
            FROM coin_transaction
            WHERE user_id = #{userId}
              AND reason = #{reason}
              AND created_at >= #{start}
              AND created_at < #{end}
            """)
    int sumChangeAmountByReasonBetween(
            @Param("userId") Long userId,
            @Param("reason") String reason,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end
    );

    @Delete("""
            DELETE FROM coin_transaction
            WHERE user_id = #{userId}
            """)
    int deleteByUserId(@Param("userId") Long userId);
}
