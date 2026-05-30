package com.footballbounce.server.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.footballbounce.server.domain.UserAccount;
import com.footballbounce.server.dto.AuthCode;
import com.footballbounce.server.dto.AuthResponse;
import com.footballbounce.server.dto.LoginRequest;
import com.footballbounce.server.dto.RegisterRequest;
import com.footballbounce.server.repository.UserLoginSessionMapper;
import com.footballbounce.server.repository.UserMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class UserServiceTest {

    private UserMapper userMapper;
    private UserLoginSessionMapper sessionMapper;
    private LineupService lineupService;
    private UserService userService;

    @BeforeEach
    void setUp() {
        userMapper = mock(UserMapper.class);
        sessionMapper = mock(UserLoginSessionMapper.class);
        lineupService = mock(LineupService.class);
        userService = new UserService(userMapper, sessionMapper, lineupService);
    }

    @Test
    void loginReturnsUserNotFoundWhenUsernameMissing() {
        when(userMapper.findByUsername("missing")).thenReturn(null);

        AuthResponse response = userService.login(login("missing", "123456"));

        assertThat(response.code()).isEqualTo(AuthCode.USER_NOT_FOUND);
        assertThat(response.message()).isEqualTo("未查询到用户");
    }

    @Test
    void loginReturnsWrongPasswordWhenPasswordDoesNotMatch() {
        when(userMapper.findByUsername("player")).thenReturn(user("player", "right-password"));

        AuthResponse response = userService.login(login("player", "wrong-password"));

        assertThat(response.code()).isEqualTo(AuthCode.WRONG_PASSWORD);
        assertThat(response.message()).isEqualTo("密码错误");
    }

    @Test
    void loginReturnsSuccessWhenPasswordMatches() {
        when(userMapper.findByUsername("player")).thenReturn(user("player", "123456"));

        AuthResponse response = userService.login(login("player", "123456"));

        assertThat(response.code()).isEqualTo(AuthCode.SUCCESS);
        assertThat(response.user()).isNotNull();
        assertThat(response.user().username()).isEqualTo("player");
    }

    @Test
    void registerReturnsUsernameExistsWhenDuplicate() {
        when(userMapper.countByUsername("player")).thenReturn(1);

        AuthResponse response = userService.register(register("player", "123456"));

        assertThat(response.code()).isEqualTo(AuthCode.USERNAME_EXISTS);
        assertThat(response.message()).isEqualTo("用户名已存在");
    }

    @Test
    void registerCreatesUserWhenUsernameIsAvailable() {
        when(userMapper.countByUsername("player")).thenReturn(0);
        when(userMapper.insert(any(UserAccount.class))).thenAnswer(invocation -> {
            UserAccount user = invocation.getArgument(0);
            user.setId(1L);
            return 1;
        });

        AuthResponse response = userService.register(register("Player", "123456"));

        assertThat(response.code()).isEqualTo(AuthCode.SUCCESS);
        assertThat(response.user()).isNotNull();
        assertThat(response.user().username()).isEqualTo("player");
        assertThat(response.user().coins()).isEqualTo(6000);
        verify(lineupService).initializeNewUserDefaults(1L);
    }

    private LoginRequest login(String username, String password) {
        LoginRequest request = new LoginRequest();
        request.setUsername(username);
        request.setPassword(password);
        return request;
    }

    private RegisterRequest register(String username, String password) {
        RegisterRequest request = new RegisterRequest();
        request.setUsername(username);
        request.setPassword(password);
        return request;
    }

    private UserAccount user(String username, String password) {
        UserAccount user = new UserAccount();
        user.setId(1L);
        user.setUsername(username);
        user.setDisplayName(username);
        user.setPasswordHash(new BCryptPasswordEncoder().encode(password));
        user.setCoins(6000);
        return user;
    }
}
