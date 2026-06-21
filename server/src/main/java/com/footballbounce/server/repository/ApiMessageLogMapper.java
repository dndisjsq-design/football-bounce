package com.footballbounce.server.repository;

import java.time.LocalDateTime;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ApiMessageLogMapper {

    @Insert("""
            INSERT INTO api_message_log (
                trace_id,
                direction,
                logged_at,
                method,
                path,
                query_string,
                status_code,
                duration_ms,
                client_ip,
                user_agent,
                content_type,
                user_id,
                match_id,
                request_id,
                message_body,
                body_bytes,
                is_truncated,
                is_error,
                created_at
            ) VALUES (
                #{traceId},
                #{direction},
                #{loggedAt},
                #{method},
                #{path},
                #{queryString},
                #{statusCode},
                #{durationMs},
                #{clientIp},
                #{userAgent},
                #{contentType},
                #{userId},
                #{matchId},
                #{requestId},
                #{messageBody},
                #{bodyBytes},
                #{truncated},
                #{error},
                NOW(6)
            )
            """)
    int insert(
            @Param("traceId") String traceId,
            @Param("direction") String direction,
            @Param("loggedAt") LocalDateTime loggedAt,
            @Param("method") String method,
            @Param("path") String path,
            @Param("queryString") String queryString,
            @Param("statusCode") Integer statusCode,
            @Param("durationMs") Long durationMs,
            @Param("clientIp") String clientIp,
            @Param("userAgent") String userAgent,
            @Param("contentType") String contentType,
            @Param("userId") Long userId,
            @Param("matchId") String matchId,
            @Param("requestId") String requestId,
            @Param("messageBody") String messageBody,
            @Param("bodyBytes") int bodyBytes,
            @Param("truncated") boolean truncated,
            @Param("error") boolean error
    );

    @Delete("""
            DELETE FROM api_message_log
            WHERE logged_at < #{cutoff}
            """)
    int deleteBefore(@Param("cutoff") LocalDateTime cutoff);
}
