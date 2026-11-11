/**
 * Notifications when JAD+ acts on a resident's request, and building notices (ADR 0027), worded for owners and
 * tenants (src/inbox/wording.ts). {topic} is the notice's subject from screens-building.ts (Water, Lift...).
 * Non-English texts drafted by Claude for native review (ADR 0016).
 */
import { words } from '../translate.js';

export const screensInboxJad = words({
  en: {
    'inbox.request_cancelled_by_jad.title': 'Request cancelled by JAD+',
    'inbox.request_cancelled_by_jad.detail': 'No visit will take place',
    'inbox.request_moved_by_jad.title': 'New partner for your request',
    'inbox.request_moved_by_jad.detail': 'JAD+ passed it to another partner',
    'inbox.request_reclassified.title': 'Handled as a routine request',
    'inbox.request_reclassified.detail':
      'JAD+ reviewed it: not an emergency. A partner still takes care of it',
    'inbox.building_notice.title': 'New notice for your building',
    'inbox.building_notice.detail': '{topic} · read it on Home',
  },
  ar: {
    'inbox.request_cancelled_by_jad.title': 'ألغت JAD+ الطلب',
    'inbox.request_cancelled_by_jad.detail': 'لن تتم أي زيارة',
    'inbox.request_moved_by_jad.title': 'شريك جديد لطلبك',
    'inbox.request_moved_by_jad.detail': 'أحالت JAD+ الطلب إلى شريك آخر',
    'inbox.request_reclassified.title': 'يُعالَج كطلب اعتيادي',
    'inbox.request_reclassified.detail': 'راجعته JAD+: ليس حالة طارئة. سيتولاه شريك مع ذلك',
    'inbox.building_notice.title': 'إشعار جديد لمبناك',
    'inbox.building_notice.detail': '{topic} · اقرأه في الصفحة الرئيسية',
  },
  fr: {
    'inbox.request_cancelled_by_jad.title': 'Demande annulée par JAD+',
    'inbox.request_cancelled_by_jad.detail': 'Aucune visite n’aura lieu',
    'inbox.request_moved_by_jad.title': 'Nouveau partenaire pour votre demande',
    'inbox.request_moved_by_jad.detail': 'JAD+ l’a confiée à un autre partenaire',
    'inbox.request_reclassified.title': 'Traitée comme une demande courante',
    'inbox.request_reclassified.detail':
      'JAD+ l’a examinée : ce n’est pas une urgence. Un partenaire s’en occupe toujours',
    'inbox.building_notice.title': 'Nouvel avis pour votre immeuble',
    'inbox.building_notice.detail': '{topic} · à lire sur l’Accueil',
  },
  ru: {
    'inbox.request_cancelled_by_jad.title': 'JAD+ отменила заявку',
    'inbox.request_cancelled_by_jad.detail': 'Визита не будет',
    'inbox.request_moved_by_jad.title': 'Новый партнёр по вашей заявке',
    'inbox.request_moved_by_jad.detail': 'JAD+ передала её другому партнёру',
    'inbox.request_reclassified.title': 'Обрабатывается как обычная заявка',
    'inbox.request_reclassified.detail': 'JAD+ проверила: это не авария. Партнёр всё равно ею займётся',
    'inbox.building_notice.title': 'Новое объявление для вашего дома',
    'inbox.building_notice.detail': '{topic} · читайте на главной',
  },
  zh: {
    'inbox.request_cancelled_by_jad.title': 'JAD+ 已取消您的请求',
    'inbox.request_cancelled_by_jad.detail': '不会安排上门',
    'inbox.request_moved_by_jad.title': '您的请求已更换合作方',
    'inbox.request_moved_by_jad.detail': 'JAD+ 已将其转交给另一家合作方',
    'inbox.request_reclassified.title': '按普通请求处理',
    'inbox.request_reclassified.detail': 'JAD+ 审核后认定不属于紧急情况，仍由合作方处理',
    'inbox.building_notice.title': '您所在楼栋有新通知',
    'inbox.building_notice.detail': '{topic} · 请在首页查看',
  },
});
