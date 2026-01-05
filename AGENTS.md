<skills_system priority="1">

## Available Skills

<usage>
When users ask you to perform tasks, check the list in <available_skills> and decide whether a skill applies.

How to use skills:
- Load the skill’s SKILL.md content into your working context when needed
- If necessary, load supporting documents from references/<file>
- Load only what is necessary; avoid redundant or bulk loading

Invocation format:
- Single call: CALL_JSONS: [{"provider":"openskills","tool":"read","input":{"skill":"<skill-name>"}}]
- Load reference: CALL_JSONS: [{"provider":"openskills","tool":"readReference","input":{"skill":"<skill-name>","file":"references/<file>"}}]
- Batch calls: CALL_JSONS: [{"provider":"openskills","tool":"read","input":{"skill":"<skill-name>"}},{"provider":"openskills","tool":"readReference","input":{"skill":"<skill-name>","file":"references/<file>"}}]

Usage notes:
- Only use skills listed in <available_skills>
- Do not call or invent skills that are not listed
- Do not reload a skill that is already present in context
</usage>

<available_skills>
<skill>
<name>poem_writer</name>
<description>用于中文诗歌创作（现代诗/五绝/七绝/词），支持自检与润色。</description>
<location>project</location>
</skill>
<skill>
<name>bbc</name>
<description>面向 BBC（企业合作线下）保险业务的流程与规则说明。</description>
<location>project</location>
</skill>
</available_skills>

</skills_system>
