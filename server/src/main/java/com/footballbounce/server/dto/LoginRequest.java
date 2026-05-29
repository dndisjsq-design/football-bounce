package com.footballbounce.server.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class LoginRequest {

    @NotBlank(message = "请输入账号")
    @Size(max = 64, message = "账号长度不能超过 64")
    private String username;

    @NotBlank(message = "请输入密码")
    @Size(max = 64, message = "密码长度不能超过 64")
    private String password;

    @Size(max = 128, message = "设备标识长度不能超过 128")
    private String deviceId;

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String getDeviceId() {
        return deviceId;
    }

    public void setDeviceId(String deviceId) {
        this.deviceId = deviceId;
    }
}
