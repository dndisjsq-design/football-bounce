package com.footballbounce.server.service;

import com.footballbounce.server.domain.UserAccount;
import com.footballbounce.server.domain.UserLoginSession;
import com.footballbounce.server.dto.AuthCode;
import com.footballbounce.server.dto.AuthResponse;
import com.footballbounce.server.dto.AutoLoginRequest;
import com.footballbounce.server.dto.LoginRequest;
import com.footballbounce.server.dto.LogoutRequest;
import com.footballbounce.server.dto.RegisterRequest;
import com.footballbounce.server.dto.UserDto;
import com.footballbounce.server.repository.UserLoginSessionMapper;
import com.footballbounce.server.repository.UserMapper;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {

    private static final int AUTO_LOGIN_DAYS = 30;

    private final UserMapper userMapper;
    private final UserLoginSessionMapper sessionMapper;
    private final LineupService lineupService;
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private final SecureRandom secureRandom = new SecureRandom();

    public UserService(UserMapper userMapper, UserLoginSessionMapper sessionMapper, LineupService lineupService) {
        this.userMapper = userMapper;
        this.sessionMapper = sessionMapper;
        this.lineupService = lineupService;
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        String username = normalizeUsername(request.getUsername());
        UserAccount user = userMapper.findByUsername(username);
        if (user == null) {
            return AuthResponse.fail(AuthCode.USER_NOT_FOUND, "未查询到用户");
        }
        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            return AuthResponse.fail(AuthCode.WRONG_PASSWORD, "密码错误");
        }
        return successWithOptionalSession(user, request.getDeviceId());
    }

    @Transactional
    public AuthResponse autoLogin(AutoLoginRequest request) {
        String deviceId = normalizeTokenPart(request.getDeviceId());
        String authToken = normalizeTokenPart(request.getAuthToken());
        if (deviceId.isEmpty() || authToken.isEmpty()) {
            return AuthResponse.fail(AuthCode.INVALID_SESSION, "自动登录已失效，请重新登录");
        }
        UserLoginSession session = sessionMapper.findActive(deviceId, sha256Hex(authToken));
        if (session == null) {
            return AuthResponse.fail(AuthCode.INVALID_SESSION, "自动登录已失效，请重新登录");
        }
        UserAccount user = userMapper.findById(session.getUserId());
        if (user == null) {
            return AuthResponse.fail(AuthCode.INVALID_SESSION, "自动登录已失效，请重新登录");
        }
        sessionMapper.touch(session.getId());
        return AuthResponse.success("自动登录成功", UserDto.from(user));
    }

    @Transactional
    public AuthResponse logout(LogoutRequest request) {
        String deviceId = normalizeTokenPart(request.getDeviceId());
        String authToken = normalizeTokenPart(request.getAuthToken());
        if (!deviceId.isEmpty() && !authToken.isEmpty()) {
            sessionMapper.revoke(deviceId, sha256Hex(authToken));
        }
        return AuthResponse.success("已退出登录", null);
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String username = normalizeUsername(request.getUsername());
        if (userMapper.countByUsername(username) > 0) {
            return AuthResponse.fail(AuthCode.USERNAME_EXISTS, "用户名已存在");
        }
        UserAccount user = new UserAccount();
        user.setUsername(username);
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        user.setDisplayName(username);
        user.setCoins(6000);
        userMapper.insert(user);
        lineupService.initializeNewUserDefaults(user.getId());
        return AuthResponse.success("注册成功", UserDto.from(user));
    }

    private AuthResponse successWithOptionalSession(UserAccount user, String deviceIdValue) {
        String deviceId = normalizeTokenPart(deviceIdValue);
        if (deviceId.isEmpty()) {
            return AuthResponse.success("登录成功", UserDto.from(user));
        }
        String token = createToken();
        LocalDateTime expiresAt = LocalDateTime.now().plusDays(AUTO_LOGIN_DAYS);
        sessionMapper.upsert(user.getId(), deviceId, sha256Hex(token), expiresAt);
        return AuthResponse.successWithToken("登录成功", UserDto.from(user), token, expiresAt.toString());
    }

    private String normalizeUsername(String username) {
        return username == null ? "" : username.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizeTokenPart(String value) {
        return value == null ? "" : value.trim();
    }

    private String createToken() {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is not available", ex);
        }
    }
}
