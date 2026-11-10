/** "JAD+ verified" (S8) and the two help shortcuts: a missing unit (U1), a payment page that failed (U11). */
import { words } from '../translate.js';

export const screensHelp = words({
  en: {
    'help.verified': 'JAD+ verified',
    'help.unitMissing': 'A residence is missing?',
    'help.unitMissingNote': 'Tell the JAD+ desk; it is usually fixed within 2 working days.',
    'help.unitMissingText': 'A residence I bought is not shown in JAD+. Project and unit number (if known): ',
    'help.payProblem': 'The payment page did not work?',
    'help.payProblemNote': 'Talk to a person at the JAD+ desk. Never send card details in a message.',
    'help.payProblemText': 'The payment page did not work for me. Please help me complete my payment.',
  },
  ar: {
    'help.verified': 'معتمد من JAD+',
    'help.unitMissing': 'هل هناك وحدة غير ظاهرة؟',
    'help.unitMissingNote': 'أبلغ مكتب JAD+؛ يُحلّ ذلك عادةً خلال يومي عمل.',
    'help.unitMissingText': 'وحدة اشتريتها لا تظهر في JAD+. المشروع ورقم الوحدة (إن عُرفا): ',
    'help.payProblem': 'لم تعمل صفحة الدفع؟',
    'help.payProblemNote': 'تحدّث إلى موظف في مكتب JAD+. لا ترسل بيانات بطاقتك في أي رسالة.',
    'help.payProblemText': 'لم تعمل صفحة الدفع معي. أرجو مساعدتي في إتمام الدفع.',
  },
  fr: {
    'help.verified': 'Vérifié JAD+',
    'help.unitMissing': 'Un logement manque ?',
    'help.unitMissingNote': 'Prévenez le service JAD+ ; c’est généralement réglé sous 2 jours ouvrés.',
    'help.unitMissingText':
      'Un logement que j’ai acheté n’apparaît pas dans JAD+. Projet et numéro du logement (si connus) : ',
    'help.payProblem': 'La page de paiement n’a pas fonctionné ?',
    'help.payProblemNote':
      'Parlez à une personne du service JAD+. N’envoyez jamais vos données de carte dans un message.',
    'help.payProblemText':
      'La page de paiement n’a pas fonctionné pour moi. Merci de m’aider à finaliser mon paiement.',
  },
  ru: {
    'help.verified': 'Проверено JAD+',
    'help.unitMissing': 'Не видите свой объект?',
    'help.unitMissingNote': 'Сообщите в службу JAD+; обычно это исправляют за 2 рабочих дня.',
    'help.unitMissingText':
      'Купленный мной объект не отображается в JAD+. Проект и номер объекта (если известны): ',
    'help.payProblem': 'Страница оплаты не сработала?',
    'help.payProblemNote':
      'Свяжитесь с сотрудником службы JAD+. Никогда не отправляйте данные карты в сообщениях.',
    'help.payProblemText': 'Страница оплаты у меня не сработала. Помогите, пожалуйста, завершить платёж.',
  },
  zh: {
    'help.verified': 'JAD+ 认证',
    'help.unitMissing': '有房产未显示？',
    'help.unitMissingNote': '请告知 JAD+ 服务台，通常会在 2 个工作日内处理。',
    'help.unitMissingText': '我购买的一处房产未在 JAD+ 中显示。项目和单元号（如已知）：',
    'help.payProblem': '付款页面无法使用？',
    'help.payProblemNote': '请联系 JAD+ 服务台的工作人员。切勿在消息中发送银行卡信息。',
    'help.payProblemText': '付款页面无法正常使用。请帮助我完成付款。',
  },
});
