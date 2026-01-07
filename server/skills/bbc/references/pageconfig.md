---
name: 页面配置参数
description: BBC业务前端页面的动态配置参数说明，用于在不同场景下展示不同的文案等
---
## 页面动态配置参数说明
下方是bbc 业务前端页面的动态配置参数说明，用于在不同场景下展示不同的文案等。

## 配置方法
在cms管理平台，的页面配置中，搜索pageconfig.xxx（其中xxx是订单号），即可找到对应的页面配置项。如果没有则要新建一个。该配置是一个数组，每一个数组项目以key value的形式存储。key就是$config(yyy)中的yyy，value就是属性值。

## 配置参数枚举
| 属性key | 属性含义 | 涉及页面文件 | 页面名称
|---|---|---|
| $config('insurant-group-tips-openLine') | 控制页面顶部提示条是否开启自动滚动（换行显示）；值为‘1’：提示条支持换行；非‘1’：不换行，自动滚动 | InsurantGroup.vue | 投保页 |
| $config('tencent-tag') | 判断是否为腾讯 BBC 项目；值为‘2’：腾讯BBC项目 |  |  |
| $config(this.para.planCode) | 获取计划编号(planCode)的配置参数（如提示文案、规则等）；用于动态判断计划人群类型（如“孩子”“连带”）并匹配对应提示；根据 planCode 获取不同规则实现差异化处理 | health-notice/index.vue | 健告页 |
| $config('children') | 腾讯BBC场景：健告选择“有部分问题”时，获取“子女被保人”投保拒绝提示文案 | health-notice/index.vue | 健告页 |
| $config('zb') | 腾讯BBC场景：健告选择“有部分问题”时，获取“主被保人”拒绝提示文案 | health-notice/index.vue | 健告页 |
| $config('ld') | 腾讯BBC场景：健告选择“有部分问题”时，获取“连带被保人”拒绝提示文案 | health-notice/index.vue | 健告页 |
| $config('self-default-plan') | “本人”默认计划配置 | insure-item/index.vue | 投保页 |
| $config('spouse-default-plan') | “配偶”默认计划配置 | insure-item/index.vue | 投保页 |
| $config('children-default-plan') | “子女”默认计划配置 | insure-item/index.vue | 投保页 |
| $config('parents-default-plan') | “父母”默认计划配置 | insure-item/index.vue | 投保页 |
| $config('originPlanCode + _old') | 旧计划到新计划映射（换款/迁移） | insure-item/index.vue | 投保页 |
| $config('upgradePlan') | 可升级计划的映射关系 | insure-item/index.vue | 投保页 |
| $config('renewal_benefit_alert') | 续保福利提醒图片 URL | insure-item/index.vue | 投保页 |
| $config('insurant-group-footer-tips') | 投保页底部提示文案（页面整段提示），用于展示自定义提示信息 | InsurantGroup.vue | 投保页 |
| $config('contact-mobile') | 客服联系电话（用于拨打按钮跳转） | InsurantGroup.vue | 投保页 |
| $config('discountPeople') | 折扣人数门槛（如“3人以上享8折”） | InsurantGroup.vue | 投保页 |
| $config('discountSize') | 折扣系数（如 1 表示 10 折） | InsurantGroup.vue | 投保页 |
| $config('premium') | 可选包的单价（单位：年），用于显示“Y.YX/人/年” | InsurantGroup.vue | 投保页 |
| $config('optional-text') | 追加可选包说明文案（如“可选包含住院护理服务”） | InsurantGroup.vue | 投保页 |
| $config('planList') | 可选适用的计划编码列表，用于筛选被保人 | InsurantGroup.vue | 投保页 |
| $config('canSelectProgramCode') | 可选对应的计划编码（用于提交时传参） | InsurantGroup.vue | 投保页 |
| $config('insurant-group-tips') | 投保页面顶部提示内容（优先级高于默认提示） | InsurantGroup.vue | 投保页 |
| $config('cannotBuySeparatelyPlan') | 标识是否禁止单独购买某些计划（用于校验逻辑） | InsurantGroup.vue | 投保页 |
| $config('person-select-openLine') | 控制通知栏是否开启换行显示（提示条，非 1 不换行）；用于设置 van-notice-bar 的 scrollable/wrapable | InsurantList/index.vue | 被保人选择页 |
| $config('insured-page-tip') | 投保页底部提示信息，用于页面规则说明或温馨提醒 | InsurantList/index.vue | 被保人选择页 |
| $config('person-select-tips') | 被保人选择页的提示文案：请确认选择的被保人信息是否准确 | InsurantList/index.vue | 被保人选择页 |
| $st('person-notice') | 通知栏目默认提示内容 | InsurantList/index.vue | 被保人选择页 |
| $st('person-select-notice') | 被保人选择页提示：请至少选择一位被保人或填写完整 | InsurantList/index.vue | 被保人选择页 |
| $config('insure-instruction-text') | 投保介绍页默认文案（流程与信息提示） | InsurantSuccess/index.vue | 投保成功页 |
| $config('success-page-title') | 投保成功页标题配置，用于自定义显示“投保成功/您已成功提交订单”等；支持后端动态配置 | InsurantSuccess/index.vue | 投保成功页 |
| $config('success-page-tip') | 投保成功页底部提示，用于告知后续处理流程；支持动态配置 | InsurantSuccess/index.vue | 投保成功页 |
| $config('success-page-download') | 成功页下载APP提示文案，引导用户下载查看保障信息；支持动态配置 | InsurantSuccess/index.vue | 投保成功页 |
| $config('insure-success-download-common') | 成功页通用下载文案；当未配置 success-page-download 时作为备用，提示下载APP查询保障信息 | InsurantSuccess/index.vue | 投保成功页 |

