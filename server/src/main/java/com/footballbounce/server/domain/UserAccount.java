package com.footballbounce.server.domain;

import java.time.LocalDateTime;

public class UserAccount {

    private Long id;

    private String username;

    private String passwordHash;

    private String displayName;

    private String avatarUrl;

    private Integer coins;

    private Integer singleTotalMatches;

    private Integer singleWinMatches;

    private Integer onlineTotalMatches;

    private Integer onlineWinMatches;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getAvatarUrl() {
        return avatarUrl;
    }

    public void setAvatarUrl(String avatarUrl) {
        this.avatarUrl = avatarUrl;
    }

    public Integer getCoins() {
        return coins;
    }

    public void setCoins(Integer coins) {
        this.coins = coins;
    }

    public Integer getSingleTotalMatches() {
        return singleTotalMatches;
    }

    public void setSingleTotalMatches(Integer singleTotalMatches) {
        this.singleTotalMatches = singleTotalMatches;
    }

    public Integer getSingleWinMatches() {
        return singleWinMatches;
    }

    public void setSingleWinMatches(Integer singleWinMatches) {
        this.singleWinMatches = singleWinMatches;
    }

    public Integer getOnlineTotalMatches() {
        return onlineTotalMatches;
    }

    public void setOnlineTotalMatches(Integer onlineTotalMatches) {
        this.onlineTotalMatches = onlineTotalMatches;
    }

    public Integer getOnlineWinMatches() {
        return onlineWinMatches;
    }

    public void setOnlineWinMatches(Integer onlineWinMatches) {
        this.onlineWinMatches = onlineWinMatches;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
