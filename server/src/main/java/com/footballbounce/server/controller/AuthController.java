package com.footballbounce.server.controller;

import com.footballbounce.server.dto.AuthResponse;
import com.footballbounce.server.dto.AutoLoginRequest;
import com.footballbounce.server.dto.LoginRequest;
import com.footballbounce.server.dto.LogoutRequest;
import com.footballbounce.server.dto.RegisterRequest;
import com.footballbounce.server.service.UserService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserService userService;

    public AuthController(UserService userService) {
        this.userService = userService;
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return userService.login(request);
    }

    @PostMapping("/auto-login")
    public AuthResponse autoLogin(@Valid @RequestBody AutoLoginRequest request) {
        return userService.autoLogin(request);
    }

    @PostMapping("/logout")
    public AuthResponse logout(@Valid @RequestBody LogoutRequest request) {
        return userService.logout(request);
    }

    @PostMapping("/register")
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
        return userService.register(request);
    }
}
