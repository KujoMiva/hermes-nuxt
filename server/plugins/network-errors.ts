import { installIgnorableNetworkErrorGuard } from '#shared/utils/networkErrors'

export default defineNitroPlugin(() => {
  installIgnorableNetworkErrorGuard()
})
