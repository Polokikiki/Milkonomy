import { onMounted, ref } from "vue"

const DISMISS_KEY = "milkonomy-announce-v2.2.3"

export function useAnnouncement() {
  const visible = ref(false)

  onMounted(() => {
    visible.value = !localStorage.getItem(DISMISS_KEY)
  })

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1")
    visible.value = false
  }

  return { visible, dismiss }
}
