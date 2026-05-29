package com.footballbounce.server.controller;
import com.footballbounce.server.dto.AuthCode;
import com.footballbounce.server.dto.AuthResponse;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ds {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public AuthResponse handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult()
                .getFieldErrors()
                .stream()
                .map(error -> error.getDefaultMessage() == null ? "请求参数错误" : error.getDefaultMessage())
                .distinct()
                .collect(Collectors.joining("；"));
        return AuthResponse.fail(AuthCode.INVALID_REQUEST, message);
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public AuthResponse handleException(Exception ex) {
        return AuthResponse.fail(AuthCode.ERROR, "服务器内部错误");
    }
}
