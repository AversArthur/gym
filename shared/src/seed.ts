// Данные перенесены из reference/trenirovki-prototype.html (объекты EX и PLAN).
// Позы и пропсы анимаций живут во фронте (web/src/anim), здесь только то, что идёт в БД.

import type { DayCode, Equipment, RepUnit, WeightMode } from './types.js';

export interface SeedExercise {
  id: string;
  nameRu: string;
  nameEn: string;
  equipment: Equipment;
  muscle: string;
  weightMode: WeightMode;
  cues: string[];
}

export interface SeedItem {
  exerciseId: string;
  sets: number;
  /** null + null = «макс» */
  repMin: number | null;
  repMax: number | null;
  unit: RepUnit;
  /** Отдых после этого упражнения. В суперсете у первого упражнения 0. */
  restSec: number;
  weightStep: number;
  supersetGroup?: number;
}

export interface SeedDay {
  code: DayCode;
  title: string;
  subtitle: string;
  items: SeedItem[];
}

export const SEED_EXERCISES: SeedExercise[] = [
  {
    id: 'squat',
    nameRu: 'Приседания в Смите',
    nameEn: 'Squat (Smith Machine)',
    equipment: 'smith',
    muscle: 'Квадрицепсы, ягодицы',
    weightMode: 'plates_only',
    cues: [
      'Стопы на 10–15 см впереди грифа, на ширине плеч',
      'Колени идут по направлению носков',
      'Спину держи ровной сам, грудь раскрыта',
      'Бедро до параллели с полом',
      'Ограничители чуть ниже нижней точки',
    ],
  },
  {
    id: 'bench',
    nameRu: 'Жим штанги лёжа',
    nameEn: 'Bench Press (Barbell)',
    equipment: 'barbell',
    muscle: 'Грудь, трицепс',
    weightMode: 'total',
    cues: [
      'Лопатки сведены и прижаты к скамье',
      'Штангу опускай к низу груди',
      'Локти под ~45° к корпусу, не в стороны',
    ],
  },
  {
    id: 'pulldown',
    nameRu: 'Тяга верхнего блока',
    nameEn: 'Lat Pulldown (Cable)',
    equipment: 'cable',
    muscle: 'Широчайшие',
    weightMode: 'stack',
    cues: [
      'Тяни грудью к перекладине, не руками',
      'Перекладина к верху груди, не за голову',
      'Вверху полностью выпрями руки',
    ],
  },
  {
    id: 'dbpress',
    nameRu: 'Жим гантелей сидя',
    nameEn: 'Seated Overhead Press (Dumbbell)',
    equipment: 'dumbbell',
    muscle: 'Плечи',
    weightMode: 'per_dumbbell',
    cues: ['Спина прижата к спинке', 'Внизу гантели на уровне ушей', 'Поясницу не прогибай'],
  },
  {
    id: 'curl',
    nameRu: 'Подъём штанги на бицепс',
    nameEn: 'Bicep Curl (Barbell)',
    equipment: 'barbell',
    muscle: 'Бицепс',
    weightMode: 'total',
    cues: ['Локти прижаты к бокам', 'Без раскачки корпусом', 'Опускай медленно, 2–3 секунды'],
  },
  {
    id: 'pushdown',
    nameRu: 'Разгибание рук на блоке',
    nameEn: 'Triceps Pushdown (Cable)',
    equipment: 'cable',
    muscle: 'Трицепс',
    weightMode: 'stack',
    cues: [
      'Локти зафиксированы у корпуса',
      'Внизу полностью разгибай руки',
      'Двигаются только предплечья',
    ],
  },
  {
    id: 'plank',
    nameRu: 'Планка',
    nameEn: 'Plank',
    equipment: 'bodyweight',
    muscle: 'Кор',
    weightMode: 'bodyweight',
    cues: [
      'Тело — прямая линия от пяток до головы',
      'Пресс и ягодицы напряжены',
      'Таз не провисает и не задирается',
    ],
  },
  {
    id: 'rdl',
    nameRu: 'Румынская тяга',
    nameEn: 'Romanian Deadlift (Barbell)',
    equipment: 'barbell',
    muscle: 'Бицепс бедра, ягодицы',
    weightMode: 'total',
    cues: [
      'Колени чуть согнуты и почти не двигаются',
      'Таз уводи назад, спина прямая',
      'Штанга скользит по бёдрам',
      'Опускай до сильного натяжения задней поверхности бедра',
    ],
  },
  {
    id: 'incline',
    nameRu: 'Жим гантелей на наклонной',
    nameEn: 'Incline Bench Press (Dumbbell)',
    equipment: 'dumbbell',
    muscle: 'Верх груди',
    weightMode: 'per_dumbbell',
    cues: ['Угол скамьи 30–45°', 'Гантели опускай к верху груди', 'Вверху не стучи гантелями'],
  },
  {
    id: 'bentrow',
    nameRu: 'Тяга штанги в наклоне',
    nameEn: 'Bent Over Row (Barbell)',
    equipment: 'barbell',
    muscle: 'Спина',
    weightMode: 'total',
    cues: [
      'Наклон 45–60°, спина прямая',
      'Тяни штангу к низу живота',
      'Локти идут назад вдоль корпуса',
    ],
  },
  {
    id: 'legcurl',
    nameRu: 'Сгибание ног лёжа',
    nameEn: 'Lying Leg Curl (Machine)',
    equipment: 'machine',
    muscle: 'Бицепс бедра',
    weightMode: 'stack',
    cues: [
      'Таз прижат к скамье',
      'Сгибай до упора, вверху пауза 1 секунда',
      'Опускай медленно, не бросай вес',
    ],
  },
  {
    id: 'lateral',
    nameRu: 'Махи гантелями в стороны',
    nameEn: 'Lateral Raise (Dumbbell)',
    equipment: 'dumbbell',
    muscle: 'Средняя дельта',
    weightMode: 'per_dumbbell',
    cues: [
      'Локти слегка согнуты',
      'Поднимай до уровня плеч, не выше',
      'Веди локтями, а не кистями',
      'Вес лёгкий, техника важнее',
    ],
  },
  {
    id: 'legraise',
    nameRu: 'Подъём ног в висе',
    nameEn: 'Hanging Leg Raise',
    equipment: 'bodyweight',
    muscle: 'Пресс',
    weightMode: 'bodyweight',
    cues: [
      'Не раскачивайся',
      'Поднимай ноги прессом, подкручивая таз',
      'Опускай медленно. Тяжело — делай скручивания лёжа',
    ],
  },
  {
    id: 'legpress',
    nameRu: 'Жим ногами',
    nameEn: 'Leg Press',
    equipment: 'machine',
    muscle: 'Квадрицепсы, ягодицы',
    weightMode: 'stack',
    cues: [
      'Поясница прижата к спинке всё время',
      'Колени не заваливаются внутрь',
      'Вверху не выпрямляй колени до конца',
    ],
  },
  {
    id: 'pullup',
    nameRu: 'Подтягивания',
    nameEn: 'Pull Up',
    equipment: 'bodyweight',
    muscle: 'Широчайшие, бицепс',
    weightMode: 'assisted',
    cues: [
      'Начинай из полного виса',
      'Тяни грудь к перекладине, сводя лопатки',
      'Меньше 6 раз — гравитрон или резинка',
    ],
  },
  {
    id: 'chestpress',
    nameRu: 'Жим в тренажёре (хаммер)',
    nameEn: 'Iso-Lateral Chest Press (Machine)',
    equipment: 'machine',
    muscle: 'Грудь',
    weightMode: 'stack',
    cues: [
      'Лопатки сведены, спина на спинке',
      'Рукоятки на уровне середины груди',
      'Вперёд с выдохом, назад медленно',
    ],
  },
  {
    id: 'cablerow',
    nameRu: 'Горизонтальная тяга блока',
    nameEn: 'Seated Row (Cable)',
    equipment: 'cable',
    muscle: 'Спина',
    weightMode: 'stack',
    cues: [
      'Спина прямая, корпус почти не раскачивается',
      'Тяни рукоять к животу',
      'В конце сведи лопатки',
    ],
  },
  {
    id: 'facepull',
    nameRu: 'Тяга каната к лицу',
    nameEn: 'Face Pull (Cable)',
    equipment: 'cable',
    muscle: 'Задняя дельта',
    weightMode: 'stack',
    cues: [
      'Блок на уровне лица или чуть выше',
      'Тяни к лицу, разводя концы каната',
      'Локти высоко, на уровне плеч',
    ],
  },
  {
    id: 'hammer',
    nameRu: 'Молотки с гантелями',
    nameEn: 'Hammer Curl (Dumbbell)',
    equipment: 'dumbbell',
    muscle: 'Бицепс, брахиалис',
    weightMode: 'per_dumbbell',
    cues: ['Ладони смотрят друг на друга', 'Локти у корпуса', 'Можно поочерёдно'],
  },
  {
    id: 'ropepush',
    nameRu: 'Разгибание рук с канатом',
    nameEn: 'Triceps Pushdown (Cable - Rope)',
    equipment: 'cable',
    muscle: 'Трицепс',
    weightMode: 'stack',
    cues: ['Внизу разводи концы каната в стороны', 'Локти неподвижны'],
  },
  {
    id: 'calf',
    nameRu: 'Подъём на носки',
    nameEn: 'Standing Calf Raise',
    equipment: 'dumbbell',
    muscle: 'Икры',
    weightMode: 'per_dumbbell',
    cues: ['Поднимайся на носки как можно выше', 'Вверху пауза 1–2 секунды', 'Опускайся медленно'],
  },
];

// Шаг веса: +2,5 кг верх тела, +5 кг ноги (правило из прототипа), гантели — 2 кг (шаг гантельного ряда в зале).
const UP = 2.5;
const LEGS = 5;
const DB = 2;

// Отдых из прототипа: «2–3 мин» → 150 с, «60–90 с» → 75 с, «90 с после пары» → 90 с на втором упражнении пары.
export const SEED_PROGRAM: { name: string; days: SeedDay[] } = {
  name: 'A·B·C · набор массы',
  days: [
    {
      code: 'A',
      title: 'Присед · жимы',
      subtitle: 'Приседания, жимы, тяга сверху, руки, кор',
      items: [
        {
          exerciseId: 'squat',
          sets: 4,
          repMin: 6,
          repMax: 10,
          unit: 'reps',
          restSec: 150,
          weightStep: LEGS,
        },
        {
          exerciseId: 'bench',
          sets: 4,
          repMin: 8,
          repMax: 10,
          unit: 'reps',
          restSec: 0,
          weightStep: UP,
          supersetGroup: 1,
        },
        {
          exerciseId: 'pulldown',
          sets: 4,
          repMin: 10,
          repMax: 12,
          unit: 'reps',
          restSec: 90,
          weightStep: UP,
          supersetGroup: 1,
        },
        {
          exerciseId: 'dbpress',
          sets: 3,
          repMin: 10,
          repMax: 10,
          unit: 'reps',
          restSec: 90,
          weightStep: DB,
        },
        {
          exerciseId: 'curl',
          sets: 3,
          repMin: 10,
          repMax: 12,
          unit: 'reps',
          restSec: 0,
          weightStep: UP,
          supersetGroup: 2,
        },
        {
          exerciseId: 'pushdown',
          sets: 3,
          repMin: 10,
          repMax: 12,
          unit: 'reps',
          restSec: 75,
          weightStep: UP,
          supersetGroup: 2,
        },
        {
          exerciseId: 'plank',
          sets: 3,
          repMin: 30,
          repMax: 45,
          unit: 'sec',
          restSec: 60,
          weightStep: UP,
        },
      ],
    },
    {
      code: 'B',
      title: 'Тяга · плечи',
      subtitle: 'Румынская тяга, наклонный жим, тяга в наклоне, плечи, пресс',
      items: [
        {
          exerciseId: 'rdl',
          sets: 4,
          repMin: 8,
          repMax: 10,
          unit: 'reps',
          restSec: 150,
          weightStep: LEGS,
        },
        {
          exerciseId: 'incline',
          sets: 4,
          repMin: 8,
          repMax: 10,
          unit: 'reps',
          restSec: 0,
          weightStep: DB,
          supersetGroup: 1,
        },
        {
          exerciseId: 'bentrow',
          sets: 4,
          repMin: 8,
          repMax: 10,
          unit: 'reps',
          restSec: 90,
          weightStep: UP,
          supersetGroup: 1,
        },
        {
          exerciseId: 'legcurl',
          sets: 3,
          repMin: 10,
          repMax: 12,
          unit: 'reps',
          restSec: 75,
          weightStep: LEGS,
        },
        {
          exerciseId: 'lateral',
          sets: 3,
          repMin: 12,
          repMax: 15,
          unit: 'reps',
          restSec: 60,
          weightStep: DB,
        },
        {
          exerciseId: 'legraise',
          sets: 3,
          repMin: 10,
          repMax: 15,
          unit: 'reps',
          restSec: 60,
          weightStep: UP,
        },
      ],
    },
    {
      code: 'C',
      title: 'Ноги · спина · руки',
      subtitle: 'Жим ногами, подтягивания, тяги, задняя дельта, руки, икры',
      items: [
        {
          exerciseId: 'legpress',
          sets: 4,
          repMin: 10,
          repMax: 12,
          unit: 'reps',
          restSec: 150,
          weightStep: LEGS,
        },
        {
          exerciseId: 'pullup',
          sets: 4,
          repMin: null,
          repMax: null,
          unit: 'reps',
          restSec: 120,
          weightStep: UP,
        },
        {
          exerciseId: 'chestpress',
          sets: 3,
          repMin: 10,
          repMax: 12,
          unit: 'reps',
          restSec: 0,
          weightStep: UP,
          supersetGroup: 1,
        },
        {
          exerciseId: 'cablerow',
          sets: 3,
          repMin: 10,
          repMax: 12,
          unit: 'reps',
          restSec: 90,
          weightStep: UP,
          supersetGroup: 1,
        },
        {
          exerciseId: 'facepull',
          sets: 3,
          repMin: 15,
          repMax: 15,
          unit: 'reps',
          restSec: 60,
          weightStep: UP,
        },
        {
          exerciseId: 'hammer',
          sets: 3,
          repMin: 10,
          repMax: 12,
          unit: 'reps',
          restSec: 0,
          weightStep: DB,
          supersetGroup: 2,
        },
        {
          exerciseId: 'ropepush',
          sets: 3,
          repMin: 12,
          repMax: 12,
          unit: 'reps',
          restSec: 75,
          weightStep: UP,
          supersetGroup: 2,
        },
        {
          exerciseId: 'calf',
          sets: 3,
          repMin: 12,
          repMax: 15,
          unit: 'reps',
          restSec: 60,
          weightStep: DB,
        },
      ],
    },
  ],
};

export const SEED_ADMIN = { username: 'arthur', displayName: 'Артур' } as const;
