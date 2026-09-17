import { defineEventHandler } from 'h3'
import { clearConnection } from '../utils/session'

export default defineEventHandler(event => {
  clearConnection(event)
  return { loggedIn: false }
})
