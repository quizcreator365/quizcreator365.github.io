import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './HomeView.vue'
import QuizPage from './player/QuizPage.vue'
import AdminLayout from './admin/AdminLayout.vue'
import QuizListView from './admin/QuizListView.vue'
import QuizEditView from './admin/QuizEditView.vue'
import QuestionEditView from './admin/QuestionEditView.vue'
import ScoresAdminView from './admin/ScoresAdminView.vue'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: HomeView },
    {
      path: '/admin',
      component: AdminLayout,
      children: [
        { path: '', name: 'quizzes', component: QuizListView },
        { path: 'quiz/new', name: 'quiz-new', component: QuizEditView },
        { path: 'quiz/:id', name: 'quiz', component: QuizEditView, props: true },
        { path: 'quiz/:id/scores', name: 'quiz-scores', component: ScoresAdminView, props: true },
        { path: 'quiz/:id/question/new', name: 'question-new', component: QuestionEditView, props: true },
        { path: 'quiz/:id/question/:qid', name: 'question', component: QuestionEditView, props: true },
      ],
    },
    { path: '/:slug', name: 'play', component: QuizPage, props: true },
    { path: '/:pathMatch(.*)*', component: HomeView },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
