import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import '@fontsource/fredoka/500.css'
import '@fontsource/fredoka/600.css'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import 'cropperjs/dist/cropper.css'
import './styles.css'

createApp(App).use(router).mount('#app')
