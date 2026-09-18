import { defineEventHandler } from 'h3'
import { proxyDashboardRequest } from '../../utils/remote-api'

export default defineEventHandler(event => proxyDashboardRequest(event))
