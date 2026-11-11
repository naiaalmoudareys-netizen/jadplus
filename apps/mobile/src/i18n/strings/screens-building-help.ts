/**
 * Building help (E12; ADR 0029): the building's security and building management numbers residents may call
 * about problems outside their home (noise, parking, lifts, shared pipes). Information only, never safety
 * instructions (L3). The hours next to a number are written by JAD+ and shown as written.
 */
import { words } from '../translate.js';

export const screensBuildingHelp = words({
  en: {
    'buildingHelp.title': 'Building help',
    'buildingHelp.linkNote': 'Security and building management numbers',
    'buildingHelp.intro':
      'Problems outside your home are looked after by your building, not by JAD+. You can call them directly.',
    'buildingHelp.security': 'Security',
    'buildingHelp.securityFor': 'Noise, parking, access, visitors',
    'buildingHelp.management': 'Building management',
    'buildingHelp.managementFor': 'Common areas, lifts, shared pipes, building-wide AC',
    'buildingHelp.call': 'Call',
    'buildingHelp.callSecurity': 'Call security',
    'buildingHelp.callManagement': 'Call building management',
    'buildingHelp.notSet': 'Number not available yet.',
    'buildingHelp.none': 'Building contacts are not available yet. Your report still reaches JAD+.',
    'buildingHelp.noneHere': 'Building contacts are not available yet for this building.',
    'buildingHelp.noHome': 'There is no residence to show building contacts for.',
    'buildingHelp.outside':
      'This comes from outside your home, so the building is responsible. Contact them directly:',
    'buildingHelp.requestLine': 'Problem outside your home (lobby, lift, corridor, parking, noise)?',
    'buildingHelp.requestLineNote': 'Contact your building directly',
    'buildingHelp.cannotCall': 'This phone cannot make calls. The number is {phone}.',
  },
  ar: {
    'buildingHelp.title': 'مساعدة المبنى',
    'buildingHelp.linkNote': 'أرقام الأمن وإدارة المبنى',
    'buildingHelp.intro': 'المشكلات خارج منزلك يتولاها مبناك وليس JAD+. يمكنك الاتصال بهم مباشرة.',
    'buildingHelp.security': 'الأمن',
    'buildingHelp.securityFor': 'الضوضاء، المواقف، الدخول، الزوار',
    'buildingHelp.management': 'إدارة المبنى',
    'buildingHelp.managementFor': 'المناطق المشتركة، المصاعد، الأنابيب المشتركة، تكييف المبنى',
    'buildingHelp.call': 'اتصال',
    'buildingHelp.callSecurity': 'اتصل بالأمن',
    'buildingHelp.callManagement': 'اتصل بإدارة المبنى',
    'buildingHelp.notSet': 'الرقم غير متوفر بعد.',
    'buildingHelp.none': 'أرقام المبنى غير متوفرة بعد. بلاغك يصل إلى JAD+ رغم ذلك.',
    'buildingHelp.noneHere': 'أرقام هذا المبنى غير متوفرة بعد.',
    'buildingHelp.noHome': 'لا توجد وحدة لعرض أرقام المبنى الخاصة بها.',
    'buildingHelp.outside': 'هذا يأتي من خارج منزلك، لذا فالمبنى هو المسؤول. تواصل معهم مباشرة:',
    'buildingHelp.requestLine': 'مشكلة خارج منزلك (الردهة، المصعد، الممر، المواقف، الضوضاء)؟',
    'buildingHelp.requestLineNote': 'تواصل مع مبناك مباشرة',
    'buildingHelp.cannotCall': 'لا يمكن لهذا الهاتف إجراء مكالمات. الرقم هو {phone}.',
  },
  fr: {
    'buildingHelp.title': 'Aide immeuble',
    'buildingHelp.linkNote': 'Numéros de la sécurité et de la gestion de l’immeuble',
    'buildingHelp.intro':
      'Les problèmes hors de votre logement relèvent de votre immeuble, pas de JAD+. Vous pouvez les appeler directement.',
    'buildingHelp.security': 'Sécurité',
    'buildingHelp.securityFor': 'Bruit, stationnement, accès, visiteurs',
    'buildingHelp.management': 'Gestion de l’immeuble',
    'buildingHelp.managementFor':
      'Parties communes, ascenseurs, canalisations communes, climatisation de l’immeuble',
    'buildingHelp.call': 'Appeler',
    'buildingHelp.callSecurity': 'Appeler la sécurité',
    'buildingHelp.callManagement': 'Appeler la gestion de l’immeuble',
    'buildingHelp.notSet': 'Numéro pas encore disponible.',
    'buildingHelp.none':
      'Les contacts de l’immeuble ne sont pas encore disponibles. Votre signalement parvient tout de même à JAD+.',
    'buildingHelp.noneHere': 'Les contacts de cet immeuble ne sont pas encore disponibles.',
    'buildingHelp.noHome': 'Aucun logement pour lequel afficher les contacts de l’immeuble.',
    'buildingHelp.outside':
      'Cela vient de l’extérieur de votre logement : l’immeuble en est responsable. Contactez-le directement :',
    'buildingHelp.requestLine':
      'Un problème hors de votre logement (hall, ascenseur, couloir, parking, bruit) ?',
    'buildingHelp.requestLineNote': 'Contactez directement votre immeuble',
    'buildingHelp.cannotCall': 'Ce téléphone ne peut pas passer d’appels. Le numéro est {phone}.',
  },
  ru: {
    'buildingHelp.title': 'Помощь по зданию',
    'buildingHelp.linkNote': 'Номера охраны и управляющей компании здания',
    'buildingHelp.intro':
      'Проблемами за пределами вашего жилья занимается здание, а не JAD+. Вы можете позвонить им напрямую.',
    'buildingHelp.security': 'Охрана',
    'buildingHelp.securityFor': 'Шум, парковка, доступ, посетители',
    'buildingHelp.management': 'Управление зданием',
    'buildingHelp.managementFor': 'Общие зоны, лифты, общие трубы, кондиционирование здания',
    'buildingHelp.call': 'Позвонить',
    'buildingHelp.callSecurity': 'Позвонить в охрану',
    'buildingHelp.callManagement': 'Позвонить в управление зданием',
    'buildingHelp.notSet': 'Номер пока недоступен.',
    'buildingHelp.none': 'Контакты здания пока недоступны. Ваше сообщение всё равно поступит в JAD+.',
    'buildingHelp.noneHere': 'Контакты этого здания пока недоступны.',
    'buildingHelp.noHome': 'Нет объекта, для которого можно показать контакты здания.',
    'buildingHelp.outside':
      'Источник находится за пределами вашего жилья, поэтому за это отвечает здание. Свяжитесь с ними напрямую:',
    'buildingHelp.requestLine': 'Проблема за пределами жилья (холл, лифт, коридор, парковка, шум)?',
    'buildingHelp.requestLineNote': 'Свяжитесь со зданием напрямую',
    'buildingHelp.cannotCall': 'С этого телефона нельзя позвонить. Номер: {phone}.',
  },
  zh: {
    'buildingHelp.title': '楼宇帮助',
    'buildingHelp.linkNote': '保安和楼宇管理电话',
    'buildingHelp.intro': '住所以外的问题由您所在的楼宇负责，而非 JAD+。您可以直接致电他们。',
    'buildingHelp.security': '保安',
    'buildingHelp.securityFor': '噪音、停车、出入、访客',
    'buildingHelp.management': '楼宇管理',
    'buildingHelp.managementFor': '公共区域、电梯、公共管道、楼宇空调',
    'buildingHelp.call': '致电',
    'buildingHelp.callSecurity': '致电保安',
    'buildingHelp.callManagement': '致电楼宇管理',
    'buildingHelp.notSet': '号码暂未提供。',
    'buildingHelp.none': '楼宇联系方式暂未提供。您的报告仍会送达 JAD+。',
    'buildingHelp.noneHere': '该楼宇的联系方式暂未提供。',
    'buildingHelp.noHome': '没有可显示楼宇联系方式的住所。',
    'buildingHelp.outside': '此问题来自您住所以外，由楼宇负责。请直接联系他们：',
    'buildingHelp.requestLine': '住所以外的问题（大堂、电梯、走廊、停车、噪音）？',
    'buildingHelp.requestLineNote': '请直接联系您的楼宇',
    'buildingHelp.cannotCall': '此手机无法拨打电话。号码是 {phone}。',
  },
});
