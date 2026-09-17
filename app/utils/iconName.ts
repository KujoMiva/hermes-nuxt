export function iconName(name: string) {
  if (!name.startsWith('i-')) return name
  const rest = name.slice(2)
  const dash = rest.indexOf('-')
  if (dash === -1) return rest
  return `${rest.slice(0, dash)}:${rest.slice(dash + 1)}`
}
