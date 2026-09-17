/**
 * 浏览器聊天界面说明。远程网关走 desktop/tui 平台，本身就会渲染 Markdown。
 * 额外系统提示通过当前 Profile 的 `config.set prompt` 写入。
 */
export const CHAT_SURFACE_INSTRUCTIONS = [
  'You are chatting inside a graphical browser chat surface. Markdown renders with GitHub flavor: headings, **bold**, lists, tables, task lists, fenced code, [label](url) links, and $math$ / $$math$$. Use that formatting when it makes the answer clearer.',
  'This supersedes the API-server default that assumes an unknown plain-text renderer. Ignore any earlier instruction to avoid markdown (asterisks, bullets, headers, code fences) or to keep replies brief because the client is unknown.',
  'Keep this profile\'s identity, language, tone, and style from SOUL.md, USER.md, and memory. Do not flatten into a generic API assistant.',
  'Local images: MEDIA:/absolute/path/to/file on its own line. Remote images: ![alt](url). Do not use markdown images for local files.'
].join('\n\n')

export function composeChatInstructions(extra = '') {
  const overlay = CHAT_SURFACE_INSTRUCTIONS.trim()
  const user = extra.trim()
  return user ? `${overlay}\n\n${user}` : overlay
}
