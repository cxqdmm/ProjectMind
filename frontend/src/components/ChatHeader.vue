<template>
  <header class="header">
    <div class="header-inner">
      <h1>智能助手</h1>
      <div class="toolbar" ref="toolbarRef">
        <button class="tool-btn" type="button" @click="onSkillsToggle" title="技能">
          <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M12 2l3 6l6 1l-4.5 4.2L18 20l-6-3.2L6 20l1.5-6.8L3 9l6-1z" fill="#0ea5e9" />
          </svg>
          技能
        </button>
        <div v-show="skillsOpen" class="skills-dropdown">
          <div class="skills-head">
            <span>技能列表</span>
            <button class="refresh-btn" type="button" @click="$emit('refreshSkills')" :disabled="skillsLoading">{{ skillsLoading ? '加载中…' : '刷新' }}</button>
          </div>
          <div class="skills-body">
            <div v-if="skillsError" class="skills-empty">加载失败</div>
            <div v-else-if="skillsLoading" class="skills-empty">加载中…</div>
            <div v-else-if="!skills.length" class="skills-empty">暂无技能</div>
            <div v-else class="skills-list">
              <div v-for="s in skills" :key="s.key" class="skill-item">
                <div class="skill-text">
                  <div class="skill-name">{{ s.name || s.key }}</div>
                  <div class="skill-desc">{{ s.description || '' }}</div>
                </div>
                <button class="skill-insert" type="button" @click="onInsertSkill(s.name || s.key)">插入</button>
              </div>
            </div>
          </div>
        </div>
        <button class="tool-btn" type="button" @click="onModelsToggle" title="模型">
          <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M12 3l9 5v8l-9 5-9-5V8l9-5zm0 2.2L6 8l6 3.3L18 8 12 5.2zm7 5.6l-7 3.9-7-3.9v4.4l7 3.9 7-3.9v-4.4z" fill="#111827" />
          </svg>
          {{ currentModelLabel || '模型' }}
        </button>
        <div v-show="modelsOpen" class="skills-dropdown">
          <div class="skills-head">
            <span>可用模型</span>
            <button class="refresh-btn" type="button" @click="$emit('refreshModels')" :disabled="modelsLoading">{{ modelsLoading ? '加载中…' : '刷新' }}</button>
          </div>
          <div class="skills-body">
            <div v-if="modelsError" class="skills-empty">加载失败</div>
            <div v-else-if="modelsLoading" class="skills-empty">加载中…</div>
            <div v-else-if="!models.length" class="skills-empty">暂无模型</div>
            <div v-else class="skills-list">
              <div v-for="m in models" :key="m.id" class="skill-item">
                <div class="skill-text">
                  <div class="skill-name">{{ m.label }}</div>
                  <div class="skill-desc">{{ m.provider }} · {{ m.model }}</div>
                </div>
                <button class="skill-insert" type="button" :disabled="!m.enabled" @click="onChooseModel(m)">{{ m.enabled ? '选择' : '不可用' }}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  currentModelLabel: { type: String, default: '' },
  skills: { type: Array, default: () => [] },
  skillsLoading: { type: Boolean, default: false },
  skillsError: { type: String, default: '' },
  models: { type: Array, default: () => [] },
  modelsLoading: { type: Boolean, default: false },
  modelsError: { type: String, default: '' },
})

const emit = defineEmits(['refreshSkills', 'refreshModels', 'chooseModel', 'insertSkill'])

const skillsOpen = ref(false)
const modelsOpen = ref(false)
const toolbarRef = ref(null)

function onSkillsToggle() {
  skillsOpen.value = !skillsOpen.value
  if (skillsOpen.value && Array.isArray(props.skills) && props.skills.length === 0 && !props.skillsLoading) {
    emit('refreshSkills')
  }
}

function onModelsToggle() {
  modelsOpen.value = !modelsOpen.value
  if (modelsOpen.value && Array.isArray(props.models) && props.models.length === 0 && !props.modelsLoading) {
    emit('refreshModels')
  }
}

function onChooseModel(m) {
  if (!m?.enabled) return
  modelsOpen.value = false
  emit('chooseModel', m)
}

function onInsertSkill(name) {
  const t = String(name || '').trim()
  if (!t) return
  skillsOpen.value = false
  emit('insertSkill', t)
}

function onDocClick(ev) {
  const el = toolbarRef.value
  if (!el) return
  const target = ev.target
  if (skillsOpen.value && target && !el.contains(target)) skillsOpen.value = false
  if (modelsOpen.value && target && !el.contains(target)) modelsOpen.value = false
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

