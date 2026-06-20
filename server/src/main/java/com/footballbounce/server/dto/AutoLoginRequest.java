package com.footballbounce.server.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class AutoLoginRequest {

    @NotBlank(message = "缺少设备标识")
    @Size(max = 128, message = "设备标识长度不能超过 128")
    private String deviceId;

    @NotBlank(message = "缺少自动登录令牌")
    @Size(max = 128, message = "自动登录令牌长度不能超过 128")
    private String authToken;

    @Size(max = 96, message = "运行实例标识长度不能超过 96")
    private String clientInstanceId;

    public String getDeviceId() {
        return deviceId;
    }

    public void setDeviceId(String deviceId) {
        this.deviceId = deviceId;
    }

    public String getAuthToken() {
        return authToken;
    }

    public void setAuthToken(String authToken) {
        this.authToken = authToken;
    }

    public String getClientInstanceId() {
        return clientInstanceId;
    }

    public void setClientInstanceId(String clientInstanceId) {
        this.clientInstanceId = clientInstanceId;
    }
}
