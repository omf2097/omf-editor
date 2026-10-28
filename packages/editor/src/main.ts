import { createApp } from 'vue';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/app.css';
import App from './App.vue';
import { router } from './router';
import { installTestHooks } from './lib/testHooks';

const app = createApp(App);
app.use(router);
app.mount('#app');

if (
  import.meta.env.DEV ||
  import.meta.env.MODE === 'test' ||
  import.meta.env.VITE_TEST_HOOKS === '1'
) {
  // After the initial navigation: the router listens for hash changes only from then on.
  void router.isReady().then(() => installTestHooks());
}
