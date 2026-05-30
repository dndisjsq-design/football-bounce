package com.footballbounce.server.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public class LineupSaveRequest {
    @NotNull(message = "用户id不能为空")
    private Long userId;

    @NotBlank(message = "阵型编号不能为空")
    private String selectedFormationId;

    @NotEmpty(message = "阵容球员不能为空")
    @Size(max = 5, message = "阵容最多只能保存5名球员")
    private List<String> lineupPlayerIds;

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getSelectedFormationId() { return selectedFormationId; }
    public void setSelectedFormationId(String selectedFormationId) { this.selectedFormationId = selectedFormationId; }
    public List<String> getLineupPlayerIds() { return lineupPlayerIds; }
    public void setLineupPlayerIds(List<String> lineupPlayerIds) { this.lineupPlayerIds = lineupPlayerIds; }
}
