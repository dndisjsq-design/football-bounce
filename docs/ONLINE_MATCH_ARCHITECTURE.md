# 联机对战架构文档

## 目标

联机对战采用“后端权威、前端显示和输入”的结构。前端负责渲染球场、展示计时、播放动作和特效、采集玩家操作；后端负责匹配、回合许可、操作合法性校验、权威实时物理推进、计时、进球、胜负、入库和结算。

当前版本不使用前端快照校验。前端不再向后端上传场上快照作为比赛判定依据，断线重连和状态校准以后单独设计。

## 一场比赛的完整流程

### 1. 匹配

前端点击多人对战后调用：

`POST /api/online-match/join`

后端把玩家放入匹配队列。匹配成功后，后端创建比赛编号、home/away 关系、双方比赛记录、action 表 start 记录，并返回：

- `matchId`
- `requestId`
- 本端显示用的 `homePlayer`、`awayPlayer`
- 本端显示用的 `homeFormationId`、`awayFormationId`
- 本端显示用的 `homeLineup`、`awayLineup`
- 初始权威场地快照 `snapshot`

前端不需要理解真实 home/away。每个客户端都把自己显示为下方红队，把对手显示为上方蓝队。后端负责对 away 端收发的数据做 180 度旋转和身份映射。

### 2. 进入比赛场景

前端拿到匹配成功数据后进入比赛场景，直接加载场地、球员、初始快照和本地显示数据。当前版本不使用 WebSocket，所有联机消息都通过 HTTP 请求完成。

### 3. 场景加载完成 ready

场景加载完成后，双方前端调用：

`POST /api/online-match/ready`

请求字段：

- `userId`
- `requestId`
- `matchId`
- `fieldWidth`
- `fieldHeight`
- 登录校验字段

后端只有在双方都 ready 后，才把比赛状态置为 started。started 之前：

- 总计时不走
- 回合计时不走
- 不允许操作
- clock 返回 `pauseReason = "waiting"`

ready 返回：

- `started`
- `clock`
- `snapshot`

如果只有一方 ready，接口会短暂等待，超时后返回 `started=false`，前端继续重试。

### 4. 时间同步

比赛 started 后，前端每 200ms 调用：

`POST /api/online-match/clock`

clock 只负责同步时间：

- `matchRemainingSeconds`
- `turnRemainingSeconds`
- `paused`
- `pauseReason`

clock 不负责推进物理，不返回场面快照，不返回比分，不返回胜负，不下发操作许可，也不下发球员物理上限。

### 5. 事件触发的回合许可请求

除 `clock` 时间轮询外，联机比赛不使用状态轮询。前端只在事件点调用：

`POST /api/online-match/turn-request`

触发时机：

- ready 返回 `started=true` 后立即调用。
- 本地播放完自己或对手的一次操作，所有球和球员完全静止后调用。

后端根据真实 home/away、当前回合、场上是否完全停止、是否在进球特效期来判断是否允许操作。

允许操作时返回：

- `canControl = true`
- `homePhysics`
- `awayPhysics`
- `skillTriggers`
- `clock`

`skillTriggers` 当前返回空数组，保留给以后技能系统。前端必须拿到 `turn-request` 的 `canControl=true` 和本回合物理上限后，才能允许玩家拖拽球员。这样力度圈、方向线、弧线显示都和后端校验上限一致。

非回合方调用时返回：

- `canControl = false`
- `message = "不是你的回合"`

`turn-request` 不返回比分、胜负和结算数据。

### 6. 玩家操作

玩家释放球员后，前端立即调用：

`POST /api/online-match/shoot`

请求字段包括：

- `commandId`
- `actorId`
- `side`
- `angleRad`
- `power`
- `curveAngleRad`
- `curveDistance`
- `fieldWidth`
- `fieldHeight`
- `clientTick`

后端处理顺序：

1. 校验登录态和比赛归属。
2. 根据真实 home/away 把前端本地操作转换为后端权威坐标。
3. 校验是否当前回合、是否已经 started、是否场上静止、是否超过球员本回合物理上限。
4. 校验通过后写入 `match_action`，`action_type = "action"`。
5. 后端权威状态立即应用该动作，开始实时推进物理。
6. 发布该动作，等待另一端通过 `/online-match/opponent-action` 查询获取。
7. 当前回合时间清零并暂停，直到场上所有物体停止。

后端不等待另一端返回动作播放结果。只要权威后端继续推进，比赛进程就继续。

### 7. 物理推进和停表规则

后端维护独立权威实时物理进程。比赛 started 后，后端不依赖前端 `state` 轮询推进比赛。`clock` 不推进物理，只读已经由后端实时进程维护的时间。

计时规则：

- 球和球员运动时：总计时继续，回合计时暂停。
- 场上完全静止且非特效期：回合计时继续。
- 进球特效期间：总计时暂停，回合计时暂停，禁止操作。
- ready 之前：总计时暂停，回合计时暂停，禁止操作。

### 8. 进球

前端可以根据本地物理先播放进球特效，但不能以本地判断直接改权威比分。后端权威物理检测到进球后：

- 写入 `match_goal_record`
- 更新权威比分
- 设置三秒进球特效暂停期
- 特效结束后复位球员和足球
- 被进球方开球

前端可以先播放本地进球特效，但不能修改权威比分。进球特效结束后，前端调用：

`POST /api/online-match/score`

score 接口只返回后端权威比分。前端收到比分后，如果任意一方达到 3 球，再调用结束校验接口。

### 9. 比赛结束

后端结束条件：

- 任意一方先进 3 球。
- 常规时间结束后比分分出胜负。

后端确认比赛结束后：

- 写入 `match_action`，`action_type = "end"`。
- 更新双方 `user_match_record`。
- 发放胜利金币奖励。

当前端检测到比分有一方达到 3 球，或者 clock 显示常规时间归零后，调用：

`POST /api/online-match/finish-check`

finish-check 只负责结束校验。后端准许结束时返回 `canEnd=true` 和结算数据。前端收到后先播放“比赛结束”特效，再显示结算页面。

## 入库规则

`match_action` 只记录三类数据：

- `start`
- `action`
- `end`

进球数据统一写入 `match_goal_record`，不再作为 action event 重复写入。

`user_match_record` 中保存双方用户视角的比赛记录。联机比赛两名正式玩家各有一条记录，`match_no` 相同，`user_side` 标明该用户真实 home/away。

## 镜像规则

后端内部权威场地永远使用真实 home/away 坐标。前端永远把本机玩家显示为 home，把对手显示为 away。

因此：

- home 端发来的操作：后端直接转权威坐标。
- away 端发来的操作：后端做 180 度旋转和球员 id/side 映射后再进入权威坐标。
- 推给 home 端的数据：后端直接转成本端显示数据。
- 推给 away 端的数据：后端做 180 度旋转和球员 id/side 映射后再发出。
- 回放如果由 away 用户观看，也应由后端按同样规则转换后再发给前端。

## 当前接口清单

- `POST /api/online-match/join`：进入匹配。
- `POST /api/online-match/status`：匹配页查询状态。
- `POST /api/online-match/cancel`：取消匹配，仅匹配阶段可用。
- `POST /api/online-match/ready`：比赛场景加载完成。
- `POST /api/online-match/clock`：200ms 时间同步，只返回时间。
- `POST /api/online-match/turn-request`：事件触发，请求本回合操作许可、物理上限和技能触发预留字段。
- `POST /api/online-match/opponent-action`：非本方回合时 250ms 轮询，获取下一条对手操作。
- `POST /api/online-match/score`：进球事件后触发，只查询权威比分。
- `POST /api/online-match/finish-check`：比分到 3 或 clock 归零后触发，查询是否准许结束并返回结算数据。
- `POST /api/online-match/shoot`：提交一次射门操作。
- `POST /api/online-match/settlement`：请求结算页数据。

旧的前端快照上传、`state` 轮询和动作长轮询不属于当前联机流程。
