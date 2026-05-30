package com.footballbounce.server.domain;

public class UserLineup {
    private Long userId;
    private String selectedFormationId;
    private String slot1PlayerId;
    private String slot2PlayerId;
    private String slot3PlayerId;
    private String slot4PlayerId;
    private String slot5PlayerId;

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getSelectedFormationId() { return selectedFormationId; }
    public void setSelectedFormationId(String selectedFormationId) { this.selectedFormationId = selectedFormationId; }
    public String getSlot1PlayerId() { return slot1PlayerId; }
    public void setSlot1PlayerId(String slot1PlayerId) { this.slot1PlayerId = slot1PlayerId; }
    public String getSlot2PlayerId() { return slot2PlayerId; }
    public void setSlot2PlayerId(String slot2PlayerId) { this.slot2PlayerId = slot2PlayerId; }
    public String getSlot3PlayerId() { return slot3PlayerId; }
    public void setSlot3PlayerId(String slot3PlayerId) { this.slot3PlayerId = slot3PlayerId; }
    public String getSlot4PlayerId() { return slot4PlayerId; }
    public void setSlot4PlayerId(String slot4PlayerId) { this.slot4PlayerId = slot4PlayerId; }
    public String getSlot5PlayerId() { return slot5PlayerId; }
    public void setSlot5PlayerId(String slot5PlayerId) { this.slot5PlayerId = slot5PlayerId; }
}
