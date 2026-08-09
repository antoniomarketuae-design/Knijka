# 92 — Първа помощ: източникът зад всеки от 29-те реда

> **За какво служи този документ.** Основателят трябва да може да провери всеки ред за трийсет секунди,
> а продуктът никога повече да не стъпва на нещо, което никой не може да изтегли отново.
> За всеки ред: твърдението, ДОСЛОВНИЯТ цитат, файлът и редът в изтегления текст, URL-ът и датата на изтегляне.
>
> **Всеки цитат в този файл е ИЗРЯЗАН от изтегления текст по локатор.** Нищо не е преписано на ръка.
> Генераторът хвърля грешка, ако локатор спре да съвпада — вместо да произведе правдоподобно изглеждащ цитат.
> Регенерирай с: `node tools/theory/gen_first_aid_sources.mjs` (виж „Как да проверите сами“ най-долу).

**Издание:** ERC Guidelines 2025 (пуснати 22.10.2025 г., Ротердам) — ERC 2021 е ОТМЕНЕНО и не се цитира никъде в банката.
**Изтеглено:** 2026-08-04. **Обхват:** 29 реда в `content/questions/ptp-i-parva-pomosht.json`
(c-first-aid-priorities 9 · c-cpr-basics 6 · c-bleeding-control 7 · c-victim-handling 7).

> **Ако четеш това заради „изричаме непроверено", започни от [§10](#10-четвърти-кръг--петте-врати-затворени-и-проверени-и-шестата-която-беше-точно-там-където-правилото-каза-да-се-търси).**
> Раздел 8 е историята на първите три врати; раздел 9 е ПРАВИЛОТО и първото преброяване;
> **раздел 10 е СЕГАШНОТО състояние** — и четиринайсетте повърхности, пуснати наново на 2026-08-05,
> петте врати с това как е намерена всяка, шестата (прегледът СЛЕД изпит) и дванайсетте неща, които
> още стоят отворени, с числа.
>
> ✅ **`node tools/theory/gen_first_aid_sources.mjs` вече НЕ може да изтрие този файл** (2026-08-09).
> Дотогава инструментът презаписваше целия файл и свършваше на §7.3, тоест едно пускане изтриваше
> §8, §9 и §10 — цялата история на вратите — а единствената защита беше тази бележка, адресирана до
> човек. Сега инструментът СЛЕПВА: генерираната глава се подменя, а ръкописната опашка след маркера
> `END GENERATED` се запазва байт по байт. И понеже пробата показа, че и ГЛАВАТА е ръкописно
> редактирана на три места (тази навигация, статусът „ЗАТВОРЕНО“ на §7.1 и една поправена мека
> тирета в цитат от ERC), инструментът **отказва да пише**, ако главата на диска се разминава с
> това, което би генерирал — изброява разликите и излиза с код 1. `--force` регенерира главата;
> опашката оцелява и в двата случая.

---

## Указател за проверка (един ред, трийсет секунди)

Всеки ред по-долу препраща към §2, където стоят твърдението, ДОСЛОВНИЯТ цитат, файлът и редът в
изтегления текст, URL-ът и датата на изтегляне. Колоната „Първи източник“ е локаторът, който отваря
най-бързо: `sed -n '<ред>p' content/medical/tools/<файл>`.

| Ред | Първи източник | Празнота | Конфликт | ⚠ Отворено |
|---|---|---|---|---|
| [`q-ptp-013`](#q-ptp-013) | `rcuk_bls.txt:130` | ✅ затворена | `ORDER-2021-SUPERSEDED` | — |
| [`q-ptp-014`](#q-ptp-014) | `rcuk_fa.txt:110` | **ДА** | — | — |
| [`q-ptp-015`](#q-ptp-015) | `erc2025_layperson.txt:752` | **ДА** | — | **⚠** |
| [`q-ptp-016`](#q-ptp-016) | `erc2025_layperson.txt:446` | — | `BCHK-ABDOMEN-ERROR` | — |
| [`q-ptp-017`](#q-ptp-017) | `rcuk_bls.txt:117` | ✅ затворена | — | **⚠** |
| [`q-ptp-018`](#q-ptp-018) | `rcuk_fa.txt:237` | — | — | — |
| [`q-ptp-019`](#q-ptp-019) | `rcuk_fa.txt:237` | **ДА** | — | — |
| [`q-ptp-020`](#q-ptp-020) | `rcuk_fa.txt:228` | **ДА** | — | — |
| [`q-ptp-021`](#q-ptp-021) | `erc2025_layperson.txt:787` | — | — | — |
| [`q-ptp-022`](#q-ptp-022) | `rcuk_fa.txt:149` | ✅ затворена | `RECOVERY-POSITION` | **⚠** |
| [`q-ptp-033`](#q-ptp-033) | `rcuk_bls.txt:157` | **ДА** | — | — |
| [`q-ptp-034`](#q-ptp-034) | `rcuk_fa.txt:110` | **ДА** | — | — |
| [`q-ptp-035`](#q-ptp-035) | `erc2025_layperson.txt:753` | **ДА** | — | — |
| [`q-ptp-036`](#q-ptp-036) | `erc2025_layperson.txt:446` | — | `BCHK-DEPTH-AGREES` | — |
| [`q-ptp-037`](#q-ptp-037) | `rcuk_fa.txt:149` | — | `RECOVERY-POSITION` | — |
| [`q-ptp-038`](#q-ptp-038) | `rcuk_fa.txt:240` | — | — | — |
| [`q-ptp-039`](#q-ptp-039) | `rcuk_fa.txt:238` | **ДА** | — | — |
| [`q-ptp-040`](#q-ptp-040) | `rcuk_fa.txt:236` | **ДА** | — | — |
| [`q-ptp-041`](#q-ptp-041) | `erc2025_layperson.txt:787` | **ДА** | — | — |
| [`q-ptp-042`](#q-ptp-042) | `rcuk_fa.txt:228` | — | — | — |
| [`q-ptp-056`](#q-ptp-056) | `erc2025_layperson.txt:785` | — | `AIRWAY-MANOEUVRE-SPLIT` | — |
| [`q-ptp-057`](#q-ptp-057) | `erc2025_layperson.txt:791` | — | `TEN-SECONDS-DROPPED-BY-RCUK` | — |
| [`q-ptp-058`](#q-ptp-058) | `rcuk_fa.txt:110` | ✅ затворена | — | — |
| [`q-ptp-059`](#q-ptp-059) | `rcuk_bls.txt:122` | — | — | — |
| [`q-ptp-060`](#q-ptp-060) | `rcuk_bls.txt:199` | **ДА** | — | — |
| [`q-ptp-061`](#q-ptp-061) | `erc2025_layperson.txt:809` | **ДА** | — | — |
| [`q-ptp-062`](#q-ptp-062) | `rcuk_fa.txt:113` | — | `ELEVATION-ABSENT` | — |
| [`q-ptp-063`](#q-ptp-063) | `erc2025_layperson.txt:787` | — | `EXTRICATION-BCHK-ONLY` | — |
| [`q-ptp-064`](#q-ptp-064) | `rcuk_fa.txt:232` | — | — | — |

### Редовете с ДЕКЛАРИРАНА празнота — прочети ТЕЗИ сам

На тези редове няма достижим източник, който да реши твърдението. Редът го КАЗВА на ученика вместо да
го премълчи — но точно затова тук няма цитат, срещу който да сверяваш: остава твоята преценка.

**12 от 29 реда:**

- `q-ptp-014` — Какво съобщаваш на 112: точно място, брой и състояние на пострадалите, допълнителна опасност.<br>  Точният СПИСЪК какво да кажеш не съществува дословно в ERC 2025 или RCUK 2025. Редът е диспечерска практика. Обяснението на реда го заявява.
- `q-ptp-015` — Съзнанието се проверява с висок глас и внимателно разтърсване на раменете.<br>  Думата „рамо“ не е отделно предписание в текста — ERC казва „gently stimulate“. Редът го признава изрично.
- `q-ptp-019` — Забит предмет не се вади; стабилизира се, натискът е около раната.<br>  ПРОВЕРЕН ОТРИЦАТЕЛЕН РЕЗУЛТАТ: „impal“ = 0 срещания в ERC 2025, RCUK BLS 2025 и RCUK First Aid 2025. Правилото за забития предмет е утвърдена практика, не цитат. Редът го казва на ученика.
- `q-ptp-020` — Каската на дишащ мотоциклетист не се сваля; сваля се само ако не диша.<br>  ПРОВЕРЕН ОТРИЦАТЕЛЕН РЕЗУЛТАТ: „helmet“ = 0 срещания и в трите издания от 2025 г. Отговорът е ИЗВЕДЕН от правилото за врата, не цитиран. Редът рекламира извода вместо да го скрие (claims.json: ungrounded-inferred-only).
- `q-ptp-033` — При двама пострадали първо отиваш при неподвижния.<br>  Насоките НЕ публикуват готово правило за подреждане на двама пострадали за неспециалисти. Подредбата е ПРИЛОЖЕНИЕ на „липсата на реакция е спусъкът“. Редът го заявява.
- `q-ptp-034` — На пострадал не се дава нищо през устата.<br>  НЕЗАЗЕМЕН. Нито ERC 2025, нито RCUK 2025 разглеждат прием през устата при травма. Обратно — ERC 2025 (ред 822) указва подсладена течност ПРЕЗ УСТАТА при съмнение за хипогликемия. Редът записва и празнотата, и изключението.
- `q-ptp-035` — При шок: топлина, спокоен глас, непрекъснато наблюдение; без лекарства и алкохол.<br>  ИЗТРИТО ТВЪРДЕНИЕ: старият текст твърдеше, че ERC препоръчва по гръб / с вдигнати крака при шок. Няма такова указание в изданията от 2025 г. Редът съобщава отсъствието.
- `q-ptp-039` — Напоената превръзка не се сваля — новата отива отгоре, натискът не се прекъсва.<br>  Самото правило „превръзка върху превръзката“ е утвърдена практика, не буквален текст от насока. Редът го казва.
- `q-ptp-040` — Яркочервена пулсираща кръв = артериално кървене; натискаш незабавно и викаш помощ.<br>  ERC 2025 и RCUK 2025 НЕ класифицират кървенето по външен вид — няма „артериално“/„венозно“ описание никъде. Разпознаването по цвят е класическа педагогика; ЗАЗЕМЕНО е ДЕЙСТВИЕТО. Редът го заявява.
- `q-ptp-041` — Заклещен без пряка опасност не се вади насила; обездвижваш колата, оставаш, следиш.<br>  ИЗТРИТА ЦИФРА: предишната вълна твърдеше, че самоизваждащ се пострадал движи врата си „до четири пъти по-малко“. ПРОВЕРЕН ОТРИЦАТЕЛЕН РЕЗУЛТАТ: „four times“ / „self-extric“ / „extricat“ = 0 срещания и в трите издания. Премахнато.
- `q-ptp-060` — Без обдишване — само непрекъснати натискания.<br>  ИЗТРИТО ПРЕУВЕЛИЧЕНИЕ: старият текст твърдеше, че нищо не може да влоши пострадал със спряло сърце. Източникът казва „рискът е малък“ — друго изречение. Коригирано.
- `q-ptp-061` — Съмнение за вътрешен кръвоизлив: 112, полагане, топлина, наблюдение, нищо през устата.<br>  „Нищо през устата“ е утвърдена практика, не изречение от насоките — редът го казва. ВЖ. СЪЩО конфликта LAY-DOWN-vs-035 по-долу.

### Редовете с ОТВОРЕНА находка от клиничния преглед

**3 реда.** Това НЕ са празноти в източниците — това са неща в НАШИЯ текст, които
трябва да се променят, преди редът да получи подпис.

- `q-ptp-015` — ПРОВЕРЕН ОТРИЦАТЕЛЕН РЕЗУЛТАТ. „shake“ = 0 срещания и в ERC 2025, и в RCUK BLS 2025. Единственият източник за РАЗТЪРСВАНЕ е БЧК (`bchk_bls.txt:20`, „Леко разтърсете рамото на пострадалия.“) — а БЧК е `not-a-grounding-source`. Междувременно RCUK казва за ПТП „Minimise movement of the neck.“ (`rcuk_fa.txt:229`). Тоест градираният верен отговор учи движение, което същите насоки искат да сведеш до минимум. Редът признава думата „рамо“, но НЕ признава глагола „разтърсваш“. Урокът вече е по-предпазлив от реда („внимателно го стимулираш“) — разминаване, което трябва да се реши в полза на реда или на урока, но не да остане.
- `q-ptp-017` — опция (b) — „Започваш незабавно, щом установиш, че пострадалият НЕ ДИША“ — е градирана ВЯРНА, но собственото обяснение на реда я оттегля два абзаца по-долу: „не че изобщо не диша, а че не диша НОРМАЛНО“. Агоналното хъркане Е дишане за неопитно око и е точно случаят, в който хората задържат масажа. Текстът на опцията трябва да стане „не реагира и не диша НОРМАЛНО“, преди редът да се подпише.
- `q-ptp-022` — ЧЕТИ ИЗКЛЮЧЕНИЕТО ВНИМАТЕЛНО. Редът (и урокът) казват: „ако не можеш да опазиш дихателния път другояче — повръща, тече кръв, лежи по лице — тогава ГО ОБРЪЩАШ“, и заземяват това на `rcuk_fa.txt:232`. Но 232 покрива САМО човек, който лежи ПО ЛИЦЕ, и го обръща ПО ГРЪБ. За повръщащ пострадал ПО ГРЪБ насоките от 2025 г. не дават изречение. Действието е клинично правилно (дихателният път бие гръбнака — `rcuk_fa.txt:231` го казва изрично), но цитатът покрива една трета от случаите, които изречението изброява. Това е същият навик „близостта минава за доказателство“, оцелял в изключението на най-опасното правило в темата.

---

## 0. Правната рамка — и защо тя не решава нито една цифра

**Наредба № 24 от 2.12.2002 г.** (МЗ + МОН, по ЗДвП чл. 152а, т. 2) определя учебната програма по първа
долекарска помощ за кандидат-водачи. Изменена с **ДВ бр. 114 от 24.12.2025 г., в сила от 26.01.2026 г.**

**Структурната находка:** чл. 9 определя КОИ ТЕМИ се преподават и изпитват и не съдържа НИТО ЕДНА клинична
стойност — нито дълбочина, нито честота, нито съотношение. чл. 8, ал. 1 делегира съдържанието на учебна
програма, изготвена от БЧК и утвърдена от министъра на здравеопазването — която **НЕ Е ПУБЛИКУВАНА**.

Затова наредбата решава ОБХВАТА и не може да реши нито една цифра. Всяко клинично твърдение носи и
заземяването си по ERC/RCUK, и темата си по чл. 9.

| Акт | За какво може да се цитира | Издание |
|---|---|---|
| ЗДвП чл. 123 | ЗАДЪЛЖЕНИЕТО на участник в ПТП да уведоми и да помогне — и нищо друго | ДВ бр. 55 от 16.06.2026 г. |
| ЗДвП чл. 124 | Същото, за водач, който НЕ е участник (случаят в q-ptp-013) | ДВ бр. 55 от 16.06.2026 г. |
| Наредба № 24 чл. 9 | Че темата е ИЗПИТНА. Никога за клинична стойност | ДВ бр. 114 от 24.12.2025 г. |
| ERC 2025 / RCUK 2025 | Всяка клинична стойност и всяко действие | 2025 |

> ⚠️ **Наредба № 24 още не е закачена в зареждача.** `ACT_IDS` в `platform/src/lib/content/law/corpus.ts`
> е `["zdvp", "naredba-iz-2539", "naredba-38"]`. Всичките **44** позовавания на „Наредба № 24“ в този
> файл се разрешават като `act-not-in-corpus` в конзолата за преглед — рецензентът вижда цитат, който
> не може да отвори. Точно дефектът, който програмата закрива, в нова форма.

---

## 1. Източниците

| id | Издател | Авторитет | URL | Изтеглен | textSha256 |
|---|---|---|---|---|---|
| `src-erc-2025-layperson` | European Resuscitation Council | `current-consensus` | https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf | 2026-08-04 | `b97907b729b6389a…` |
| `src-rcuk-2025-bls` | Resuscitation Council UK | `national-adaptation` | https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-basic-life-support-guidelines | 2026-08-04 | `8946f3015fe68d99…` |
| `src-rcuk-2025-first-aid` | Resuscitation Council UK | `national-adaptation` | https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines | 2026-08-04 | `8717d5935cc5ce67…` |
| `src-naredba-24-lex` | Министерство на здравеопазването и Министерство на образованието и науката (текст: lex.bg) | `binding-bg` | https://lex.bg/laws/ldoc/2135461835 | 2026-08-04 | `0be8bbaa249fd695…` |
| `src-bchk-first-help-bls` | Български Червен кръст (превод на издание на Червения кръст Белгия-Фландрия) | `not-a-grounding-source` | https://www.redcross.bg/first-help/-----------.-------------------------------------------.html | 2026-08-04 | `ab1d95ee5693cc40…` |
| `src-bchk-first-help-steps` | Български Червен кръст (превод на издание на Червения кръст Белгия-Фландрия) | `not-a-grounding-source` | https://www.redcross.bg/first-help/page-5.html | 2026-08-04 | `3b5be5b57ccdf24e…` |
| `src-naredba-24-sars` | Държавна агенция „Безопасност на движението по пътищата“ (нормативна база) | `superseded` | https://www.sars.gov.bg/wp-content/uploads/2023/07/%D0%9D%D0%B0%D1%80%D0%B5%D0%B4%D0%B1%D0%B0-%E2%84%96-24-%D0%BE%D1%82-2-%D0%B4%D0%B5%D0%BA%D0%B5%D0%BC%D0%B2%D1%80%D0%B8-2002-%D0%B3.pdf | 2026-08-04 | `091af9b9d13f51d7…` |

**Защо БЧК е `not-a-grounding-source`:** страницата сама заявява, че е изградена по насоките на МФЧК/ЧП
от 2011 г. — четиринайсет години стари — и носи жива грешка за мястото на натиска (виж конфликт
BCHK-ABDOMEN-ERROR). Цитира се като конфликт и — за изваждането от автомобил — като единствен източник,
защото там международен източник няма.

**Защо копието на ДАБДП е `superseded`:** sars.gov.bg сервира снимка на Сиела от 17.01.2023 г., отпреди
ДВ бр. 114/2025. Регистрирано, за да не може да бъде цитирано по невнимание.

**Първичните глави на ERC 2025** (Adult BLS, Resuscitation 2025;215(Suppl 1):110771; First Aid, 110752)
са зад Elsevier с TDM-only лиценз и връщат 403 на машинно изтегляне. Заземяването минава през двете
свободни представяния — собствената книга за неспециалисти на ERC и насоките на RCUK 2025.

---

## 2. Редовете

### c-first-aid-priorities — приоритети на място (9 реда)

#### `q-ptp-013`

**Твърдение:** Редът на действие: обезопасяваш → щом не реагира, звъниш на 112 → оценяваш дишането, докато чакаш.

**Право:** ЗДвП чл. 124, т. 1 и т. 2 (водачът не е участник) · Наредба № 24 чл. 9, т. 4

- **RCUK 2025 Adult Basic Life Support** — `rcuk_bls.txt:130`
  > Call 999 for any unresponsive person. Rescuers no longer need to confirm abnormal breathing before calling. Initiate the call first, then assess breathing while waiting for the call to be answered. The ambulance service call handler will be able to assist you in identifying abnormal breathing, if needed.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-basic-life-support-guidelines · изтеглен 2026-08-04
- **RCUK 2025 Adult Basic Life Support** — `rcuk_bls.txt:114`
  > If a person is found unresponsive, call 999 as soon as possible. Ideally, this should be carried out by a bystander, but if no one else is available you should make the call yourself before assessing whether breathing is normal.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-basic-life-support-guidelines · изтеглен 2026-08-04
- **ERC 2025 (Guidelines for Everyone)** — `erc2025_layperson.txt:787`
  > Do not move the person unless they are in an unsafe situation.
  <br>https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf · изтеглен 2026-08-04

> ✅ **ЗАТВОРЕНА ПРАЗНОТА:** редът цитираше чл. 124, т. 1 като „да вземеш … да окажеш … за него“ — глаголи, пренаписани във второ лице ВЪТРЕ в кавичките, докато „за него“ остана в третото. Сега вътре в кавичките стои дословният текст на закона, а второто лице е извън тях. ПРОВЕРЕНО ПОВТОРНО, знак по знак, срещу `content/law/acts/zdvp.json`: „да вземе мерки за осигуряване безопасността на движението и да окаже помощ на пострадалите, ако това не представлява опасност за него“ съвпада дословно с чл. 124, т. 1. Виж §7.3.

> **КОНФЛИКТ:** виж §3 → `ORDER-2021-SUPERSEDED`

#### `q-ptp-014`

**Твърдение:** Какво съобщаваш на 112: точно място, брой и състояние на пострадалите, допълнителна опасност.

**Право:** ЗДвП чл. 123, ал. 1, т. 2, б. „а“ · чл. 124, т. 2

- **RCUK 2025 First Aid** — `rcuk_fa.txt:110`
  > Expectations of a first aid provider: Always call for help early and, ideally, use a speakerphone, especially if alone. As a general principle, only use equipment and medications you have been trained to use.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04

> **ПРАЗНОТА, ЗАПИСАНА В САМИЯ РЕД:** Точният СПИСЪК какво да кажеш не съществува дословно в ERC 2025 или RCUK 2025. Редът е диспечерска практика. Обяснението на реда го заявява.

#### `q-ptp-015`

**Твърдение:** Съзнанието се проверява с висок глас и внимателно разтърсване на раменете.

**Право:** ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 2 и т. 4

- **ERC 2025 (Guidelines for Everyone)** — `erc2025_layperson.txt:752`
  > for responsiveness. Is the person responsive? Are they able to speak? Gently stimulate the person. Ask loudly, “Are you ok?”
  <br>https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf · изтеглен 2026-08-04
- **RCUK 2025 Adult Basic Life Support** — `rcuk_bls.txt:160`
  > Slow, laboured breathing, as well as other abnormal patterns such as agonal gasping or panting, must be recognised as signs of cardiac arrest.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-basic-life-support-guidelines · изтеглен 2026-08-04

> **ПРАЗНОТА, ЗАПИСАНА В САМИЯ РЕД:** Думата „рамо“ не е отделно предписание в текста — ERC казва „gently stimulate“. Редът го признава изрично.

> ⚠️ **ОТКРИТО ПРИ ПРЕГЛЕДА, ОЩЕ ОТВОРЕНО:** ПРОВЕРЕН ОТРИЦАТЕЛЕН РЕЗУЛТАТ. „shake“ = 0 срещания и в ERC 2025, и в RCUK BLS 2025. Единственият източник за РАЗТЪРСВАНЕ е БЧК (`bchk_bls.txt:20`, „Леко разтърсете рамото на пострадалия.“) — а БЧК е `not-a-grounding-source`. Междувременно RCUK казва за ПТП „Minimise movement of the neck.“ (`rcuk_fa.txt:229`). Тоест градираният верен отговор учи движение, което същите насоки искат да сведеш до минимум. Редът признава думата „рамо“, но НЕ признава глагола „разтърсваш“. Урокът вече е по-предпазлив от реда („внимателно го стимулираш“) — разминаване, което трябва да се реши в полза на реда или на урока, но не да остане.

#### `q-ptp-033`

**Твърдение:** При двама пострадали първо отиваш при неподвижния.

**Право:** ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 4

- **RCUK 2025 Adult Basic Life Support** — `rcuk_bls.txt:157-158`
  > Suspect cardiac arrest in any person who is unresponsive. Call 999 without delay.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-basic-life-support-guidelines · изтеглен 2026-08-04
- **RCUK 2025 Adult Basic Life Support** — `rcuk_bls.txt:164`
  > If there is any doubt, assume cardiac arrest and start CPR.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-basic-life-support-guidelines · изтеглен 2026-08-04
- **RCUK 2025 First Aid** — `rcuk_fa.txt:144`
  > Pay immediate attention to safety, the responsiveness of the victim, and life-threatening bleeding.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04

> **ПРАЗНОТА, ЗАПИСАНА В САМИЯ РЕД:** Насоките НЕ публикуват готово правило за подреждане на двама пострадали за неспециалисти. Подредбата е ПРИЛОЖЕНИЕ на „липсата на реакция е спусъкът“. Редът го заявява.

#### `q-ptp-034`

**Твърдение:** На пострадал не се дава нищо през устата.

**Право:** Наредба № 24 чл. 9, т. 3

- **RCUK 2025 First Aid** — `rcuk_fa.txt:110`
  > Expectations of a first aid provider: Always call for help early and, ideally, use a speakerphone, especially if alone. As a general principle, only use equipment and medications you have been trained to use.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04

> **ПРАЗНОТА, ЗАПИСАНА В САМИЯ РЕД:** НЕЗАЗЕМЕН. Нито ERC 2025, нито RCUK 2025 разглеждат прием през устата при травма. Обратно — ERC 2025 (ред 822) указва подсладена течност ПРЕЗ УСТАТА при съмнение за хипогликемия. Редът записва и празнотата, и изключението.

#### `q-ptp-035`

**Твърдение:** При шок: топлина, спокоен глас, непрекъснато наблюдение; без лекарства и алкохол.

**Право:** Наредба № 24 чл. 9, т. 3 и т. 9

- **ERC 2025 (Guidelines for Everyone)** — `erc2025_layperson.txt:753-754`
  > If the person is responsive: talk to them calmly. Ask for permission to check for any physical signs of illness or injury. As you continue to look them over, ask simple questions to learn about what happened; what they are experiencing; any serious allergies; any other relevant medical history.
  <br>https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf · изтеглен 2026-08-04
- **ERC 2025 (Guidelines for Everyone)** — `erc2025_layperson.txt:825`
  > Prevent hypothermia – remove wet clothes and use blankets to warm them.
  <br>https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf · изтеглен 2026-08-04
- **RCUK 2025 First Aid** — `rcuk_fa.txt:283`
  > Insulation: cover the person with dry blankets or clothing to minimise heat loss.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04
- **ERC 2025 (Guidelines for Everyone)** — `erc2025_layperson.txt:813`
  > Continue to monitor the person carefully for deterioration or loss of responsiveness (possible cardiac arrest).
  <br>https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf · изтеглен 2026-08-04

> **ПРАЗНОТА, ЗАПИСАНА В САМИЯ РЕД:** ИЗТРИТО ТВЪРДЕНИЕ: старият текст твърдеше, че ERC препоръчва по гръб / с вдигнати крака при шок. Няма такова указание в изданията от 2025 г. Редът съобщава отсъствието.

#### `q-ptp-056`

**Твърдение:** Преди проверка на дишането дихателният път се отваря — глава назад, брадичка нагоре.

**Право:** Наредба № 24 чл. 9, т. 4 и т. 6

- **ERC 2025 (Guidelines for Everyone)** — `erc2025_layperson.txt:785`
  > Place one hand on the forehead and the fingertips of your other hand under the point of the chin, gently tilt the person’s head back, lifting the chin to open the airway.
  <br>https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf · изтеглен 2026-08-04
- **ERC 2025 (Guidelines for Everyone)** — `erc2025_layperson.txt:783`
  > Has the person fallen from a height or experienced major trauma? (Consider cervical spine injury).
  <br>https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf · изтеглен 2026-08-04

> **КОНФЛИКТ:** виж §3 → `AIRWAY-MANOEUVRE-SPLIT`

#### `q-ptp-057`

**Твърдение:** Дишането се проверява до 10 секунди, с поглед, слух и усещане.

**Право:** Наредба № 24 чл. 9, т. 4

- **ERC 2025 (Guidelines for Everyone)** — `erc2025_layperson.txt:791-792`
  > Is the person breathing normally? n “ Look, Listen, Feel” for normal breathing for a maximum of 10 seconds.
  <br>https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf · изтеглен 2026-08-04
- **RCUK 2025 Adult Basic Life Support** — `rcuk_bls.txt:160`
  > Slow, laboured breathing, as well as other abnormal patterns such as agonal gasping or panting, must be recognised as signs of cardiac arrest.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-basic-life-support-guidelines · изтеглен 2026-08-04

> **КОНФЛИКТ:** виж §3 → `TEN-SECONDS-DROPPED-BY-RCUK`

#### `q-ptp-058`

**Твърдение:** Не затваряш; високоговорител; звъниш при всяко съмнение.

**Право:** ЗДвП чл. 123, ал. 1, т. 2, б. „а“ · чл. 124, т. 2

- **RCUK 2025 First Aid** — `rcuk_fa.txt:110`
  > Expectations of a first aid provider: Always call for help early and, ideally, use a speakerphone, especially if alone. As a general principle, only use equipment and medications you have been trained to use.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04
- **RCUK 2025 Adult Basic Life Support** — `rcuk_bls.txt:167-168`
  > If you have a mobile phone, activate the speaker function and call 999 without delay. Assess breathing while you wait for the call to be answered.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-basic-life-support-guidelines · изтеглен 2026-08-04
- **RCUK 2025 Adult Basic Life Support** — `rcuk_bls.txt:164`
  > If there is any doubt, assume cardiac arrest and start CPR.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-basic-life-support-guidelines · изтеглен 2026-08-04

> ✅ **ЗАТВОРЕНА ПРАЗНОТА:** Опция b („безплатно, дори без кредит или SIM карта“) е далекосъобщителна регулация, не медицина, и вече Е заземена — но извън този регистър, защото не е медицински факт: `src-krs-pravila-112` в content/sources (Правила на КРС, обн. ДВ, бр. 12 от 11.02.2022 г., изм. ДВ, бр. 34 от 16.04.2024 г.). Чл. 3, т. 1 задължава мобилните оператори да поддържат повикване към 112 „от мобилни устройства без SIM карта“; чл. 2, ал. 1 — безплатно; чл. 2, ал. 2 — и за ползватели със забрана за изходящи повиквания (изчерпана предплатена карта). ОСТАВА КАЗАНО В РЕДА: правилото задължава МРЕЖИТЕ и не е измерване на терен, а до 2022 г. България е била сред ЗАБРАНЯВАЩИТЕ (`src-ecc-report-324`) — тоест не е европейска даденост.

### c-cpr-basics — сърдечен масаж (6 реда)

#### `q-ptp-016`

**Твърдение:** Натиск в центъра на гръдния кош, 100–120 в минута.

**Право:** Наредба № 24 чл. 9, т. 4

- **ERC 2025 (Guidelines for Everyone)** — `erc2025_layperson.txt:446`
  > Effectiveness depends on hand position, depth of chest compressions, and the rate at which they are done. The ERC Guidelines are clear that the most effective rate is 100 to 120 chest compressions per minute. Equally important to effective compressions is the force or depth of each push: each compression must push the chest down 5 to 6 cm. The hands should be positioned on the centre of the chest.
  <br>https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf · изтеглен 2026-08-04
- **RCUK 2025 Adult Basic Life Support** — `rcuk_bls.txt:183-184`
  > Start chest compressions as soon as possible. Place the heel of one hand on the lower half of the sternum (“in the centre of the chest”).
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-basic-life-support-guidelines · изтеглен 2026-08-04

> **КОНФЛИКТ:** виж §3 → `BCHK-ABDOMEN-ERROR`

#### `q-ptp-017`

**Твърдение:** Започваш веднага; 30:2 при обучен; продължаваш до помощ / дишане / изтощение; не е нужно разрешение.

**Право:** Наредба № 24 чл. 9, т. 4 · ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · ЗДвП чл. 124, т. 1 (добавени,
защото „не е нужно разрешение“ е ЮРИДИЧЕСКО твърдение и не може да стъпва на клинична насока)

- **RCUK 2025 Adult Basic Life Support** — `rcuk_bls.txt:117`
  > Start chest compressions as soon as possible.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-basic-life-support-guidelines · изтеглен 2026-08-04
- **ERC 2025 (Guidelines for Everyone)** — `erc2025_layperson.txt:449`
  > When bystanders are able and willing to provide rescue breaths, the recommendation is that they should perform CPR at a rate of 30 compressions followed by 2 breaths, repeated until EMS are on scene and able to take over. This will ensure the best chance for
  <br>https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf · изтеглен 2026-08-04
- **RCUK 2025 First Aid** — `rcuk_fa.txt:141`
  > Continue CPR: until professional help arrives and takes over (or tells you to stop), the individual becomes responsive (speaks, opens eyes, moves purposefully, or breathes normally), or the rescuer becomes exhausted.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04
- **RCUK 2025 Adult Basic Life Support** — `rcuk_bls.txt:111`
  > Everyone can learn how to perform cardiopulmonary resuscitation (CPR).
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-basic-life-support-guidelines · изтеглен 2026-08-04
- **ERC 2025 (Guidelines for Everyone)** — `erc2025_layperson.txt:411`
  > These initial life-saving actions can be performed by anyone who comes upon a person in cardiac arrest. Without intervention, survival is impossible. According to numerous studies cited in the ERC Guidelines 2025, when bystanders step in to help, about 15% of people in cardiac arrest survive.
  <br>https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf · изтеглен 2026-08-04
- **RCUK 2025 Adult Basic Life Support** — `rcuk_bls.txt:128`
  > The risk of harm from CPR is low. Rescuers should not be concerned that they will cause serious injury if the person is not in cardiac arrest.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-basic-life-support-guidelines · изтеглен 2026-08-04
- **ERC 2025 (Guidelines for Everyone)** — `erc2025_layperson.txt:745`
  > The 2025 Guidelines emphasise the importance of members of the public being trained in life-saving techniques throughout Europe. The availability to the public of general, as well as specialised and advanced first aid courses is the key to saving lives in the community. Many excellent courses are already available locally. The ERC recommends that these be expanded with a focus on accessibility and diversity, in terms of financial, linguistic, cultural and social barriers. Course content must be tailored to audience needs and abilities and include measures to help any first aid provider cope with the stress, anxiety, and emotional distress of such an intense and unexpected event. Instructions should also include information on local “Good Samaritan” and “Duty to Respond” laws, which vary between locations.
  <br>https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf · изтеглен 2026-08-04

> ✅ **ЗАТВОРЕНА ПРАЗНОТА:** редът поставяше в кавички „Everyone can learn how to perform CPR“; източникът пише „…cardiopulmonary resuscitation (CPR)“. Сега е дословно. И по-същественото: този цитат носеше сам и твърдението „не ти трябва разрешение или диплома“, което е различно твърдение. Клиничната половина вече стъпва на `rcuk_bls.txt:111` + `erc2025_layperson.txt:411` + `rcuk_bls.txt:128`; юридическата — на ЗДвП, защото самият ERC препраща към местното право (`erc2025_layperson.txt:745`). Виж §7.3.

> ⚠️ **ОТКРИТО ПРИ ПРЕГЛЕДА, ОЩЕ ОТВОРЕНО:** опция (b) — „Започваш незабавно, щом установиш, че пострадалият НЕ ДИША“ — е градирана ВЯРНА, но собственото обяснение на реда я оттегля два абзаца по-долу: „не че изобщо не диша, а че не диша НОРМАЛНО“. Агоналното хъркане Е дишане за неопитно око и е точно случаят, в който хората задържат масажа. Текстът на опцията трябва да стане „не реагира и не диша НОРМАЛНО“, преди редът да се подпише.

#### `q-ptp-036`

**Твърдение:** Дълбочина 5–6 см с пълно изправяне между натисканията.

**Право:** Наредба № 24 чл. 9, т. 4

- **ERC 2025 (Guidelines for Everyone)** — `erc2025_layperson.txt:446`
  > Effectiveness depends on hand position, depth of chest compressions, and the rate at which they are done. The ERC Guidelines are clear that the most effective rate is 100 to 120 chest compressions per minute. Equally important to effective compressions is the force or depth of each push: each compression must push the chest down 5 to 6 cm. The hands should be positioned on the centre of the chest.
  <br>https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf · изтеглен 2026-08-04
- **RCUK 2025 Adult Basic Life Support** — `rcuk_bls.txt:119`
  > Compress to a depth of at least 5 cm, but not more than 6 cm.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-basic-life-support-guidelines · изтеглен 2026-08-04
- **RCUK 2025 Adult Basic Life Support** — `rcuk_bls.txt:192`
  > Allow the chest to recoil completely after each compression; avoid leaning on the chest.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-basic-life-support-guidelines · изтеглен 2026-08-04
- **БЧК — Основна мед. помощ и АВД** — `bchk_bls.txt:89`
  > 6. Уверете се, че раменете ви са разположени точно над гърдите на пострадалия. Натискайте най-малко 5 см (макс. 6 cм) надолу върху гръдната кост с изпънати ръце.
  <br>https://www.redcross.bg/first-help/-----------.-------------------------------------------.html · изтеглен 2026-08-04

> **КОНФЛИКТ:** виж §3 → `BCHK-DEPTH-AGREES`

#### `q-ptp-037`

**Твърдение:** На човек, който диша нормално, масаж НЕ се прави; дихателният път се пази, не се мести без нужда.

**Право:** Наредба № 24 чл. 9, т. 2 и т. 4

- **RCUK 2025 First Aid** — `rcuk_fa.txt:149`
  > In cases of agonal breathing or trauma, do NOT move the person into the recovery position.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04
- **ERC 2025 (Guidelines for Everyone)** — `erc2025_layperson.txt:787`
  > Do not move the person unless they are in an unsafe situation.
  <br>https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf · изтеглен 2026-08-04
- **RCUK 2025 Adult Basic Life Support** — `rcuk_bls.txt:162`
  > If any person is unresponsive with abnormal breathing, cardiac arrest should be assumed.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-basic-life-support-guidelines · изтеглен 2026-08-04

> **КОНФЛИКТ:** виж §3 → `RECOVERY-POSITION`

#### `q-ptp-059`

**Твърдение:** AED се използва от всекиго, по гласовите указания; никой не докосва при анализ и разряд.

**Право:** Наредба № 24 чл. 9, т. 4

- **RCUK 2025 Adult Basic Life Support** — `rcuk_bls.txt:122`
  > Anyone can use an Automated External Defibrillator (AED).
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-basic-life-support-guidelines · изтеглен 2026-08-04
- **RCUK 2025 Adult Basic Life Support** — `rcuk_bls.txt:125`
  > AED signage should include a statement that no training is needed to use an AED.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-basic-life-support-guidelines · изтеглен 2026-08-04
- **RCUK 2025 Adult Basic Life Support** — `rcuk_bls.txt:211-212`
  > Use an AED as soon as it is available. Open the AED case (if present). Some AEDs automatically turn on when opened. If not, identify the power button and turn it on.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-basic-life-support-guidelines · изтеглен 2026-08-04
- **RCUK 2025 Adult Basic Life Support** — `rcuk_bls.txt:217`
  > Ensure that nobody touches the person whilst the AED is analysing the heart rhythm.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-basic-life-support-guidelines · изтеглен 2026-08-04

#### `q-ptp-060`

**Твърдение:** Без обдишване — само непрекъснати натискания.

**Право:** Наредба № 24 чл. 9, т. 4

- **RCUK 2025 Adult Basic Life Support** — `rcuk_bls.txt:199`
  > If you are not trained to provide rescue breaths, perform continuous chest compressions without interruptions.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-basic-life-support-guidelines · изтеглен 2026-08-04
- **RCUK 2025 Adult Basic Life Support** — `rcuk_bls.txt:128`
  > The risk of harm from CPR is low. Rescuers should not be concerned that they will cause serious injury if the person is not in cardiac arrest.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-basic-life-support-guidelines · изтеглен 2026-08-04
- **RCUK 2025 First Aid** — `rcuk_fa.txt:140`
  > Saving a person’s life is a priority, and first aiders should not be concerned about causing harm to the patient.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04

> **ПРАЗНОТА, ЗАПИСАНА В САМИЯ РЕД:** ИЗТРИТО ПРЕУВЕЛИЧЕНИЕ: старият текст твърдеше, че нищо не може да влоши пострадал със спряло сърце. Източникът казва „рискът е малък“ — друго изречение. Коригирано.

### c-bleeding-control — спиране на кръвотечение (7 реда)

#### `q-ptp-018`

**Твърдение:** Първото действие при силно кървене е директен натиск върху раната.

**Право:** ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 5

- **RCUK 2025 First Aid** — `rcuk_fa.txt:237`
  > Apply firm, direct manual pressure to any bleeding injury site.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04
- **RCUK 2025 First Aid** — `rcuk_fa.txt:238`
  > Apply a standard or ideally a haemostatic dressing directly to the bleeding injury, then apply firm direct pressure, which may require at some sites the dressing to be packed into the wound. In the absence of any first aid dressings, any clean material can be utilised in this way, with an emphasis on stopping the bleeding.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04
- **RCUK 2025 First Aid** — `rcuk_fa.txt:241`
  > Place the tourniquet around the traumatised limb 5-7cm above the injury, but not over a joint.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04

#### `q-ptp-019`

**Твърдение:** Забит предмет не се вади; стабилизира се, натискът е около раната.

**Право:** ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 5

- **RCUK 2025 First Aid** — `rcuk_fa.txt:237`
  > Apply firm, direct manual pressure to any bleeding injury site.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04
- **RCUK 2025 First Aid** — `rcuk_fa.txt:238`
  > Apply a standard or ideally a haemostatic dressing directly to the bleeding injury, then apply firm direct pressure, which may require at some sites the dressing to be packed into the wound. In the absence of any first aid dressings, any clean material can be utilised in this way, with an emphasis on stopping the bleeding.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04

> **ПРАЗНОТА, ЗАПИСАНА В САМИЯ РЕД:** ПРОВЕРЕН ОТРИЦАТЕЛЕН РЕЗУЛТАТ: „impal“ = 0 срещания в ERC 2025, RCUK BLS 2025 и RCUK First Aid 2025. Правилото за забития предмет е утвърдена практика, не цитат. Редът го казва на ученика.

#### `q-ptp-038`

**Твърдение:** Турникет само при животозастрашаващо кървене, което натискът не спира; часът се записва; не се сваля.

**Право:** ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 5

- **RCUK 2025 First Aid** — `rcuk_fa.txt:240`
  > Apply a tourniquet as soon as possible for life-threatening extremity bleeding that is not controlled by direct manual pressure:
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04
- **RCUK 2025 First Aid** — `rcuk_fa.txt:241`
  > Place the tourniquet around the traumatised limb 5-7cm above the injury, but not over a joint.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04
- **RCUK 2025 First Aid** — `rcuk_fa.txt:243`
  > Write the time the tourniquet was applied.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04
- **RCUK 2025 First Aid** — `rcuk_fa.txt:244`
  > Do not release the tourniquet. It should only be released by a healthcare professional.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04
- **RCUK 2025 First Aid** — `rcuk_fa.txt:245`
  > In some cases, you may need to apply a second tourniquet, above the first tourniquet, to control the bleeding.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04

#### `q-ptp-039`

**Твърдение:** Напоената превръзка не се сваля — новата отива отгоре, натискът не се прекъсва.

**Право:** ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 5

- **RCUK 2025 First Aid** — `rcuk_fa.txt:238`
  > Apply a standard or ideally a haemostatic dressing directly to the bleeding injury, then apply firm direct pressure, which may require at some sites the dressing to be packed into the wound. In the absence of any first aid dressings, any clean material can be utilised in this way, with an emphasis on stopping the bleeding.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04
- **RCUK 2025 First Aid** — `rcuk_fa.txt:240`
  > Apply a tourniquet as soon as possible for life-threatening extremity bleeding that is not controlled by direct manual pressure:
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04

> **ПРАЗНОТА, ЗАПИСАНА В САМИЯ РЕД:** Самото правило „превръзка върху превръзката“ е утвърдена практика, не буквален текст от насока. Редът го казва.

#### `q-ptp-040`

**Твърдение:** Яркочервена пулсираща кръв = артериално кървене; натискаш незабавно и викаш помощ.

**Право:** ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 5

- **RCUK 2025 First Aid** — `rcuk_fa.txt:236-237`
  > Call 999. Apply firm, direct manual pressure to any bleeding injury site.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04
- **RCUK 2025 First Aid** — `rcuk_fa.txt:237`
  > Apply firm, direct manual pressure to any bleeding injury site.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04

> **ПРАЗНОТА, ЗАПИСАНА В САМИЯ РЕД:** ERC 2025 и RCUK 2025 НЕ класифицират кървенето по външен вид — няма „артериално“/„венозно“ описание никъде. Разпознаването по цвят е класическа педагогика; ЗАЗЕМЕНО е ДЕЙСТВИЕТО. Редът го заявява.

#### `q-ptp-061`

**Твърдение:** Съмнение за вътрешен кръвоизлив: 112, полагане, топлина, наблюдение, нищо през устата.

**Право:** ЗДвП чл. 123, ал. 1, т. 2, б. „в“ и б. „а“

- **ERC 2025 (Guidelines for Everyone)** — `erc2025_layperson.txt:809`
  > Are there any signs of a low blood pressure or shock: n Very fast or very slow heart rate? n Pale, cool or clammy skin? n Dizziness or confusion?
  <br>https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf · изтеглен 2026-08-04
- **ERC 2025 (Guidelines for Everyone)** — `erc2025_layperson.txt:811`
  > Make the person comfortable.
  <br>https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf · изтеглен 2026-08-04
- **ERC 2025 (Guidelines for Everyone)** — `erc2025_layperson.txt:825`
  > Prevent hypothermia – remove wet clothes and use blankets to warm them.
  <br>https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf · изтеглен 2026-08-04
- **ERC 2025 (Guidelines for Everyone)** — `erc2025_layperson.txt:813`
  > Continue to monitor the person carefully for deterioration or loss of responsiveness (possible cardiac arrest).
  <br>https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf · изтеглен 2026-08-04

> **ПРАЗНОТА, ЗАПИСАНА В САМИЯ РЕД:** „Нищо през устата“ е утвърдена практика, не изречение от насоките — редът го казва. ВЖ. СЪЩО конфликта LAY-DOWN-vs-035 по-долу.

#### `q-ptp-062`

**Твърдение:** ПРЕМАХНАТ КЛЮЧ: повдигането на крайника вече не е верен отговор; ескалацията е натиск → превръзка в раната → турникет.

**Право:** ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 5

- **RCUK 2025 First Aid** — `rcuk_fa.txt:113`
  > Life-threatening bleeding: an escalating approach with manual direct pressure and, thereafter, haemostatic dressing and/or tourniquets.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04
- **RCUK 2025 First Aid** — `rcuk_fa.txt:238`
  > Apply a standard or ideally a haemostatic dressing directly to the bleeding injury, then apply firm direct pressure, which may require at some sites the dressing to be packed into the wound. In the absence of any first aid dressings, any clean material can be utilised in this way, with an emphasis on stopping the bleeding.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04

> **КОНФЛИКТ:** виж §3 → `ELEVATION-ABSENT`

### c-victim-handling — боравене с пострадал (7 реда)

#### `q-ptp-020`

**Твърдение:** Каската на дишащ мотоциклетист не се сваля; сваля се само ако не диша.

**Право:** ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 6

- **RCUK 2025 First Aid** — `rcuk_fa.txt:228`
  > Suspect a cervical spine injury in a person who fell or dived from a height, was crushed by machinery or a heavy object or was involved in a road traffic or a sporting accident.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04
- **RCUK 2025 First Aid** — `rcuk_fa.txt:229`
  > Minimise movement of the neck. If the person is awake and alert, encourage them to self-maintain their neck in a comfortable, stable position.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04
- **RCUK 2025 First Aid** — `rcuk_fa.txt:231`
  > If the person is unresponsive and lying on their back, kneel behind their head and immobilise their head and neck using the head or trapezius squeeze technique to maintain a neutral in-line position. Consider the need to open the person’s airway using the ‘jaw-thrust’ technique. Airway opening, if required, always has priority over in-line immobilisation; using a jaw thrust manoeuvre should maintain a neutral position of the neck.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04

> **ПРАЗНОТА, ЗАПИСАНА В САМИЯ РЕД:** ПРОВЕРЕН ОТРИЦАТЕЛЕН РЕЗУЛТАТ: „helmet“ = 0 срещания и в трите издания от 2025 г. Отговорът е ИЗВЕДЕН от правилото за врата, не цитиран. Редът рекламира извода вместо да го скрие (claims.json: ungrounded-inferred-only).

#### `q-ptp-021`

**Твърдение:** Мести се само при пожар или реална опасност от нов удар.

**Право:** ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 8

- **ERC 2025 (Guidelines for Everyone)** — `erc2025_layperson.txt:787`
  > Do not move the person unless they are in an unsafe situation.
  <br>https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf · изтеглен 2026-08-04
- **ERC 2025 (Guidelines for Everyone)** — `erc2025_layperson.txt:750`
  > assessment of the situation. Is the person at risk of further injury? (Road traffic? Spilled chemicals? Live wires? Violent persons?) Is it safe for you to approach them? Can you move them to safety?
  <br>https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf · изтеглен 2026-08-04
- **БЧК — Основните стъпки в първата помощ** — `bchk_page5.txt:38`
  > Това може да стане само когато той се намира в пряка, неконтролируема, опасност, ако не може да се осигури необходимата безопасност и ако можете да предприемете действия, без да се излагате на риск. Ако е необходимо, преместете го до най-близкото безопасно място.
  <br>https://www.redcross.bg/first-help/page-5.html · изтеглен 2026-08-04

#### `q-ptp-022`

**Твърдение:** ОБЪРНАТ КЛЮЧ: дишащ в безсъзнание при ПТП НЕ се обръща в странично положение; главата и вратът се придържат в една линия.

**Право:** ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9

- **RCUK 2025 First Aid** — `rcuk_fa.txt:149`
  > In cases of agonal breathing or trauma, do NOT move the person into the recovery position.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04
- **ERC 2025 (Guidelines for Everyone)** — `erc2025_layperson.txt:764`
  > Recovery position For adults and children with decreased responsiveness due to illness, with no signs of physical trauma and who do not need chest compressions and rescue breathing, it is best that they be
  <br>https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf · изтеглен 2026-08-04
- **ERC 2025 (Guidelines for Everyone)** — `erc2025_layperson.txt:768`
  > In cases of not normal breathing or trauma, do NOT move the person into the recovery position. If they are in cardiac arrest position them lying flat on their back for CPR.
  <br>https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf · изтеглен 2026-08-04
- **RCUK 2025 First Aid** — `rcuk_fa.txt:231`
  > If the person is unresponsive and lying on their back, kneel behind their head and immobilise their head and neck using the head or trapezius squeeze technique to maintain a neutral in-line position. Consider the need to open the person’s airway using the ‘jaw-thrust’ technique. Airway opening, if required, always has priority over in-line immobilisation; using a jaw thrust manoeuvre should maintain a neutral position of the neck.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04
- **RCUK 2025 First Aid** — `rcuk_fa.txt:148`
  > Place adults and children with a decreased level of responsiveness who do NOT meet the criteria for CPR into a lateral (side-lying) recovery position.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04
- **RCUK 2025 First Aid** — `rcuk_fa.txt:232`
  > If the person is unresponsive and is lying face down, check if their airway is open and hold their neck in a stable position. If you need to open their airway, ask others to help you carefully roll them as a unit onto their back, while keeping their neck in line with their body and as stable as possible. Then apply the head or trapezius squeeze.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04

> ✅ **ЗАТВОРЕНА ПРАЗНОТА:** виж §3 → `AIRWAY-MANOEUVRE-SPLIT`. Редът вече казва защо ТУК не се отмята главата, а в `q-ptp-056` се отмята, и цитира и двата източника. Кавичките са пренаписани: ERC и RCUK изреченията стояха в български превод ВЪТРЕ в кавичките — сега вътре стои английският оригинал, а преводът е извън тях.

> **КОНФЛИКТ:** виж §3 → `RECOVERY-POSITION`

> ⚠️ **ОТКРИТО ПРИ ПРЕГЛЕДА, ОЩЕ ОТВОРЕНО:** ЧЕТИ ИЗКЛЮЧЕНИЕТО ВНИМАТЕЛНО. Редът (и урокът) казват: „ако не можеш да опазиш дихателния път другояче — повръща, тече кръв, лежи по лице — тогава ГО ОБРЪЩАШ“, и заземяват това на `rcuk_fa.txt:232`. Но 232 покрива САМО човек, който лежи ПО ЛИЦЕ, и го обръща ПО ГРЪБ. За повръщащ пострадал ПО ГРЪБ насоките от 2025 г. не дават изречение. Действието е клинично правилно (дихателният път бие гръбнака — `rcuk_fa.txt:231` го казва изрично), но цитатът покрива една трета от случаите, които изречението изброява. Това е същият навик „близостта минава за доказателство“, оцелял в изключението на най-опасното правило в темата.

#### `q-ptp-041`

**Твърдение:** Заклещен без пряка опасност не се вади насила; обездвижваш колата, оставаш, следиш.

**Право:** ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 8

- **ERC 2025 (Guidelines for Everyone)** — `erc2025_layperson.txt:787`
  > Do not move the person unless they are in an unsafe situation.
  <br>https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf · изтеглен 2026-08-04
- **RCUK 2025 First Aid** — `rcuk_fa.txt:229`
  > Minimise movement of the neck. If the person is awake and alert, encourage them to self-maintain their neck in a comfortable, stable position.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04
- **RCUK 2025 First Aid** — `rcuk_fa.txt:230`
  > Never force an uncooperative person into any position, as this may exacerbate an injury.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04

> **ПРАЗНОТА, ЗАПИСАНА В САМИЯ РЕД:** ИЗТРИТА ЦИФРА: предишната вълна твърдеше, че самоизваждащ се пострадал движи врата си „до четири пъти по-малко“. ПРОВЕРЕН ОТРИЦАТЕЛЕН РЕЗУЛТАТ: „four times“ / „self-extric“ / „extricat“ = 0 срещания и в трите издания. Премахнато.

#### `q-ptp-042`

**Твърдение:** Болка във врата след удар → сяда и остава неподвижен до преглед.

**Право:** ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 6

- **RCUK 2025 First Aid** — `rcuk_fa.txt:228`
  > Suspect a cervical spine injury in a person who fell or dived from a height, was crushed by machinery or a heavy object or was involved in a road traffic or a sporting accident.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04
- **RCUK 2025 First Aid** — `rcuk_fa.txt:229`
  > Minimise movement of the neck. If the person is awake and alert, encourage them to self-maintain their neck in a comfortable, stable position.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04
- **RCUK 2025 First Aid** — `rcuk_fa.txt:230`
  > Never force an uncooperative person into any position, as this may exacerbate an injury.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04

#### `q-ptp-063`

**Твърдение:** Горяща кола: освобождаваш колана, хващаш изотзад под мишниците, теглиш по оста на тялото.

**Право:** ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 8

- **ERC 2025 (Guidelines for Everyone)** — `erc2025_layperson.txt:787`
  > Do not move the person unless they are in an unsafe situation.
  <br>https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf · изтеглен 2026-08-04
- **БЧК — Основните стъпки в първата помощ** — `bchk_page5.txt:39`
  > Ако пострадалият е в съзнание,обяснете му какво възнамерявате да направите, и го помолете да Ви сътрудничи. При възможност придържайте шията на пострадалия по време на евакуационната процедура.Завъртайте главата, шията или тялото на пострадалия колкото е възможно по-малко. Съществуват няколко техники за евакуация на пострадал, като влачене /със и без одеяло/, повдигане и др.
  <br>https://www.redcross.bg/first-help/page-5.html · изтеглен 2026-08-04

> **КОНФЛИКТ:** виж §3 → `EXTRICATION-BCHK-ONLY`

#### `q-ptp-064`

**Твърдение:** При наложено местене: глава-врат-гръб в една линия, най-кратък път, двама-трима координирано.

**Право:** ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 6

- **RCUK 2025 First Aid** — `rcuk_fa.txt:232`
  > If the person is unresponsive and is lying face down, check if their airway is open and hold their neck in a stable position. If you need to open their airway, ask others to help you carefully roll them as a unit onto their back, while keeping their neck in line with their body and as stable as possible. Then apply the head or trapezius squeeze.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04
- **RCUK 2025 First Aid** — `rcuk_fa.txt:229`
  > Minimise movement of the neck. If the person is awake and alert, encourage them to self-maintain their neck in a comfortable, stable position.
  <br>https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines · изтеглен 2026-08-04
- **БЧК — Основните стъпки в първата помощ** — `bchk_page5.txt:39`
  > Ако пострадалият е в съзнание,обяснете му какво възнамерявате да направите, и го помолете да Ви сътрудничи. При възможност придържайте шията на пострадалия по време на евакуационната процедура.Завъртайте главата, шията или тялото на пострадалия колкото е възможно по-малко. Съществуват няколко техники за евакуация на пострадал, като влачене /със и без одеяло/, повдигане и др.
  <br>https://www.redcross.bg/first-help/page-5.html · изтеглен 2026-08-04

---

## 3. Конфликтите — записани, не решени мълчаливо

Статут никога не си противоречи. Насоките — да. Затова конфликтите се записват дословно и се показват на
рецензента, вместо някой да избере страна тихомълком.

### `RECOVERY-POSITION` — Стабилното странично положение при ПТП — международните насоки срещу българското обучение

- ERC 2025 и RCUK 2025 СЪВПАДАТ и двете забраняват страничното положение при травма. Пострадал при ПТП е травма по определение.
- БЧК учи страничното положение за всеки в безсъзнание, който диша, БЕЗ изключение за травма.
- РЕШЕНИЕТО НЕ Е НА АГЕНТ. q-ptp-022 е с обърнат ключ и остава `needs-review` точно защото отклонението от националния учебен орган по животоспасяващ въпрос иска подпис на основателя.
- ВНИМАНИЕ КЪМ ОБРАТНАТА ГРЕШКА: ако ученик запомни само „настрани е грешно“, ще гледа как пострадал аспирира повърнато. И двата реда носят изхода: ако не можеш да опазиш дихателния път другояче — обръщаш, като едно цяло.

**RCUK 2025 First Aid** `rcuk_fa.txt:148-149`
> Place adults and children with a decreased level of responsiveness who do NOT meet the criteria for CPR into a lateral (side-lying) recovery position. In cases of agonal breathing or trauma, do NOT move the person into the recovery position.

**ERC 2025 (Guidelines for Everyone)** `erc2025_layperson.txt:764`
> Recovery position For adults and children with decreased responsiveness due to illness, with no signs of physical trauma and who do not need chest compressions and rescue breathing, it is best that they be

**ERC 2025 (Guidelines for Everyone)** `erc2025_layperson.txt:768`
> In cases of not normal breathing or trauma, do NOT move the person into the recovery position. If they are in cardiac arrest position them lying flat on their back for CPR.

**RCUK 2025 First Aid** `rcuk_fa.txt:231`
> If the person is unresponsive and lying on their back, kneel behind their head and immobilise their head and neck using the head or trapezius squeeze technique to maintain a neutral in-line position. Consider the need to open the person’s airway using the ‘jaw-thrust’ technique. Airway opening, if required, always has priority over in-line immobilisation; using a jaw thrust manoeuvre should maintain a neutral position of the neck.

**БЧК — Основна мед. помощ и АВД** `bchk_bls.txt:52`
> 1. Поставете пострадалия в стабилно странично положение. Виж „Техника – стабилно странично положение“.

### `BCHK-ABDOMEN-ERROR` — БЧК публикува жива грешка за мястото на натиска

- Страницата на БЧК указва натиск „върху горната част на корема“. ERC и RCUK 2025 казват долната половина на ГРЪДНАТА КОСТ и изрично не корема.
- Прилича на изгубено отрицание при превода от изданието на Червения кръст Белгия-Фландрия.
- Това е достатъчно основание БЧК никога да не бъде заземяващ източник (`authority: not-a-grounding-source`). Цитира се като конфликт, никога като указание.
- q-ptp-016 не просто маркира дистрактора като грешен — обяснението посочва откъде идва грешката, защото български 17-годишен може да я прочете днес.

**RCUK 2025 Adult Basic Life Support** `rcuk_bls.txt:183-184`
> Start chest compressions as soon as possible. Place the heel of one hand on the lower half of the sternum (“in the centre of the chest”).

**БЧК — Основна мед. помощ и АВД** `bchk_bls.txt:88`
> 5. Повдигнете пръстите си нагоре, за да се избегне оказването на натиск върху ребрата. Натискайте върху горната част на корема или долната част на гръдната кост.

### `BCHK-DEPTH-AGREES` — Дълбочината е точката, в която БЧК СЪВПАДА с ERC 2025

- Тезата, че БЧК още учи 4–5 см, НЕ СЕ ПОТВЪРЖДАВА от текста към 2026-08-04 — страницата казва 5–6 см.
- Нищо надолу по веригата не бива да стъпва на твърдението за 4–5 см.

**ERC 2025 (Guidelines for Everyone)** `erc2025_layperson.txt:446`
> Effectiveness depends on hand position, depth of chest compressions, and the rate at which they are done. The ERC Guidelines are clear that the most effective rate is 100 to 120 chest compressions per minute. Equally important to effective compressions is the force or depth of each push: each compression must push the chest down 5 to 6 cm. The hands should be positioned on the centre of the chest.

**RCUK 2025 Adult Basic Life Support** `rcuk_bls.txt:119`
> Compress to a depth of at least 5 cm, but not more than 6 cm.

**БЧК — Основна мед. помощ и АВД** `bchk_bls.txt:89`
> 6. Уверете се, че раменете ви са разположени точно над гърдите на пострадалия. Натискайте най-малко 5 см (макс. 6 cм) надолу върху гръдната кост с изпънати ръце.

### `ORDER-2021-SUPERSEDED` — Редът на обаждането се е ОБЪРНАЛ в изданията от 2025 г.

- До ERC/RCUK 2021: провери дишането → после звънни. От 2025 г.: звъниш при всеки, който не реагира, и оценяваш дишането, ДОКАТО чакаш.
- Всеки ред, който подрежда „провери дишането → после звънни“, кодира отменено издание. q-ptp-013 е с пренаписана ВЯРНА ОПЦИЯ, не само с ново обяснение.

**RCUK 2025 Adult Basic Life Support** `rcuk_bls.txt:130`
> Call 999 for any unresponsive person. Rescuers no longer need to confirm abnormal breathing before calling. Initiate the call first, then assess breathing while waiting for the call to be answered. The ambulance service call handler will be able to assist you in identifying abnormal breathing, if needed.

**RCUK 2025 Adult Basic Life Support** `rcuk_bls.txt:114`
> If a person is found unresponsive, call 999 as soon as possible. Ideally, this should be carried out by a bystander, but if no one else is available you should make the call yourself before assessing whether breathing is normal.

### `TEN-SECONDS-DROPPED-BY-RCUK` — Едно и също семейство насоки, две представяния, една изчезнала цифра

- Прозорецът от 10 секунди оцелява в главата за първа помощ/ABCDE на ERC 2025 и на страницата на БЧК.
- ПРОВЕРЕН ОТРИЦАТЕЛЕН РЕЗУЛТАТ: не се появява никъде в текста на RCUK Adult BLS 2025.
- Затова q-ptp-057 го преподава като „не се бави повече от 10 секунди“, а не като процедура, която трябва да изкараш докрай преди да действаш — и го казва на ученика.

**ERC 2025 (Guidelines for Everyone)** `erc2025_layperson.txt:791-792`
> Is the person breathing normally? n “ Look, Listen, Feel” for normal breathing for a maximum of 10 seconds.

### `ELEVATION-ABSENT` — Повдигането на крайника отсъства от изданията 2025 г.

- ПРОВЕРЕНИ ОТРИЦАТЕЛНИ РЕЗУЛТАТИ, преброени машинно и в трите текста от 2025 г.: „elevation“ 0 · „elevate“ 0 · „elevating“ 0 · „raise the limb“ 0 · „pressure point“ 0 · „cryotherap“ 0.
- Тоест повдигането не е просто недоказано — то отсъства от актуалната стълбица. Затова ключът е премахнат и заменен с реалната ескалация.
- Редът НЕ твърди, че повдигането вреди. Опасното е да РАЗЧИТАШ на него — отнема ръце и внимание от натиска.

**RCUK 2025 First Aid** `rcuk_fa.txt:113`
> Life-threatening bleeding: an escalating approach with manual direct pressure and, thereafter, haemostatic dressing and/or tourniquets.

**RCUK 2025 First Aid** `rcuk_fa.txt:238`
> Apply a standard or ideally a haemostatic dressing directly to the bleeding injury, then apply firm direct pressure, which may require at some sites the dressing to be packed into the wound. In the absence of any first aid dressings, any clean material can be utilised in this way, with an emphasis on stopping the bleeding.

### `EXTRICATION-BCHK-ONLY` — Изваждането от автомобил: решението е заземено три пъти, ХВАТЪТ — само от БЧК

- ПРОВЕРЕН ОТРИЦАТЕЛЕН РЕЗУЛТАТ: „extricat“ = 0 срещания в ERC 2025, RCUK BLS 2025 и RCUK First Aid 2025. Международните насоки изобщо не разглеждат изваждане от автомобил.
- Наредба № 24 чл. 9, т. 8 прави темата ИЗПИТНА, без да описва хват.
- Затова за тази ЕДНА тема БЧК не е „изостанал от консенсуса“ — няма консенсус, от който да изостава. Редът заявява източника открито.
- РАЗМИНАВАНЕ В РЕГИСТЪРА: content/medical/claims.json още държи med-extrication-technique на `ungrounded-no-reachable-source`, докато редът вече цитира вече-изтеглените и хеширани стъпки на БЧК. Регистърът изостава от съдържанието.

**ERC 2025 (Guidelines for Everyone)** `erc2025_layperson.txt:787`
> Do not move the person unless they are in an unsafe situation.

**БЧК — Основните стъпки в първата помощ** `bchk_page5.txt:38`
> Това може да стане само когато той се намира в пряка, неконтролируема, опасност, ако не може да се осигури необходимата безопасност и ако можете да предприемете действия, без да се излагате на риск. Ако е необходимо, преместете го до най-близкото безопасно място.

**БЧК — Основните стъпки в първата помощ** `bchk_page5.txt:39`
> Ако пострадалият е в съзнание,обяснете му какво възнамерявате да направите, и го помолете да Ви сътрудничи. При възможност придържайте шията на пострадалия по време на евакуационната процедура.Завъртайте главата, шията или тялото на пострадалия колкото е възможно по-малко. Съществуват няколко техники за евакуация на пострадал, като влачене /със и без одеяло/, повдигане и др.

### `AIRWAY-MANOEUVRE-SPLIT` — ✅ ЗАТВОРЕНО · Двата реда вече казват какво ги различава

- q-ptp-056 (вярна опция): отмяташ главата назад и повдигаш брадичката — по ERC 2025, раздел A-Airway. Сцената: в безсъзнание, дишането ОЩЕ НЕ Е проверено.
- q-ptp-022 (обяснение): придържаш неподвижно и „при нужда“ отваряш дихателния път с избутване на долната челюст, „а не с отмятане на главата“ — по RCUK 2025, раздел за шийна имобилизация. Сцената: диша НОРМАЛНО.
- ДВЕТЕ СА ПОМИРИМИ и всяко е коректно заземено в своя източник: различава ги състоянието на дишането. При непроверено дишане дихателният път бие гръбнака; при потвърдено нормално дишане няма какво да отваряш, затова не пипаш.
- Не е опасно действие — и двата хвата отварят дихателния път. Опасното е колебанието. По THEO-4 ученикът трябва да знае ЗАЩО, а тук „защото“ е състоянието на дишането.
- **КАК Е ЗАТВОРЕНО:** и двата реда вече носят един и същ разграничител, изписан еднакво и в двата — ЗНАЕШ ЛИ ВЕЧЕ, ЧЕ ЧОВЕКЪТ ДИША НОРМАЛНО — и всеки препраща към другия случай, вместо да го премълчава. 056 добавя и дословния текст на RCUK за хвата с челюстта (`rcuk_fa.txt:231`); 022 добавя дословния текст на ERC за отмятането (`erc2025_layperson.txt:785`), за да види ученикът и двата източника на едно място. Нито един ключ не е пипан — сменена е само липсата на „защо“.
- **ОСТАВА ОТВОРЕНО ЕДНО НЕЩО, И ТО НЕ Е В БАНКАТА:** разграничителят го няма в `content/lessons/l-accidents-first-aid.json`. Урокът учи отмятането в `b-priorities` и придържането в `b-victim-handling`, без изречението, което ги помирява — тоест точно колебанието, което двата реда вече премахват, урокът още може да произведе.

**ERC 2025 (Guidelines for Everyone)** `erc2025_layperson.txt:785`
> Place one hand on the forehead and the fingertips of your other hand under the point of the chin, gently tilt the person’s head back, lifting the chin to open the airway.

**RCUK 2025 First Aid** `rcuk_fa.txt:231`
> If the person is unresponsive and lying on their back, kneel behind their head and immobilise their head and neck using the head or trapezius squeeze technique to maintain a neutral in-line position. Consider the need to open the person’s airway using the ‘jaw-thrust’ technique. Airway opening, if required, always has priority over in-line immobilisation; using a jaw thrust manoeuvre should maintain a neutral position of the neck.

### `LAY-DOWN-vs-035` — ✅ ЗАТВОРЕНО · „Make the person comfortable“ вече не носи повече, отколкото казва

- q-ptp-035 заявява изрично, че в изданията от 2025 г. НЯМА указание пострадал в шок да се полага по гръб или с вдигнати крака.
- q-ptp-061 маркира „полагаш го да лежи“ като ВЯРЕН отговор и го извеждаше от „Make the person comfortable“ (ERC 2025, ред 811).
- Строго погледнато двете не си противоречат: 035 отрича конкретно ПО ГРЪБ / С ВДИГНАТИ КРАКА, а 061 казва само „полагаш“. Но ученик, който прочете и двата, ще види противоречие.
- Заземяването на q-ptp-061 за топлината и наблюдението беше стабилно; под въпрос беше само глосата „полагаш го“.
- **КАК Е ЗАТВОРЕНО:** 061 вече разделя трите действия по произход — топлината и наблюдението са дословни от ERC, а „лежи, вместо да ходи“ е обявено изрично като практически прочит на „Make the person comfortable.“ плюс „Do not move the person unless they are in an unsafe situation.“ (`erc2025_layperson.txt:787`), а НЕ като изречение от насока. Добавен е абзац, който казва, че това не е старата поза. 035 е допълнен огледално: отрича се позата, не покоят. Ключовете и на двата реда са непроменени.
- **ПОПРАВКА В САМИЯ 035, намерена при затварянето:** редът твърдеше „единственото „по гръб“ там е за сърдечен масаж“. Не е единственото: `rcuk_fa.txt:232` указва обръщане по гръб и на човек, който лежи по лице и трябва да му се отвори дихателният път. И двете места са заради дишането, не заради шока — редът вече го казва така.

**ERC 2025 (Guidelines for Everyone)** `erc2025_layperson.txt:811`
> Make the person comfortable.

**ERC 2025 (Guidelines for Everyone)** `erc2025_layperson.txt:809`
> Are there any signs of a low blood pressure or shock: n Very fast or very slow heart rate? n Pale, cool or clammy skin? n Dizziness or confusion?

---

## 4. Какво още НЕ е заземено

| Тема | Ред(ове) | Състояние |
|---|---|---|
| Учебната програма по чл. 8, ал. 1 | всички | **НЕ Е ПОЛУЧЕНА.** Изготвя се от БЧК, утвърждава се от МЗ, не е публикувана. Търсено в нормативната база на ДАБДП, mh.government.bg, strategy.bg (обществена консултация 11635), redcross.bg. Иска човешко запитване до БЧК или заявление по ЗДОИ до МЗ. Тя е мястото, където живее всяка българска клинична стойност — и единственото, което би решило въпроса за страничното положение. |
| Мотоциклетна каска | q-ptp-020 | `ungrounded-inferred-only`. „helmet“ = 0 срещания в трите издания. Отговорът е ИЗВЕДЕН от правилото за врата и редът го заявява. |
| Нищо през устата | q-ptp-034, q-ptp-061 | Незаземено. Практика на спешната и анестезиологичната медицина. ERC 2025 дори указва подсладена течност през устата при хипогликемия — абсолютно „никога нищо“ се опровергава от същата насока в друг случай. |
| Списъкът „какво да кажеш на 112“ | q-ptp-014 | Няма дословен списък в нито едно издание. Диспечерска практика. |
| Подреждане на двама пострадали | q-ptp-033 | Няма правило за неспециалисти. ПРИЛОЖЕНИЕ на „липсата на реакция е спусъкът“. ERC „BBB triage tool“ е проверен и ОТХВЪРЛЕН като заземяване — контекстът му е педиатричен. |
| „112 е безплатен, без SIM карта“ | q-ptp-058 | ✅ **ЗАТВОРЕНО — беше единственият верен отговор, чиято ИСТИННОСТ никой не беше проверил.** Заземен, но НЕ тук: далекосъобщителен факт, затова стои в `content/sources` — `src-krs-pravila-112`, Правила на КРС, обн. ДВ, бр. 12 от 11.02.2022 г., изм. ДВ, бр. 34 от 16.04.2024 г. (чл. 3, т. 1 „от мобилни устройства без SIM карта“; чл. 2, ал. 1 безплатно; чл. 2, ал. 2 и при забрана за изходящи повиквания). Две неща остават ЗАПИСАНИ В РЕДА, а не изгладени: правилото задължава МРЕЖИТЕ и не е измерване на терен; и до 2022 г. България самата е забранявала тези повиквания (`src-ecc-report-324`, ECC Report 324), тоест това е национален избор, не европейска даденост. |
| Забит предмет · превръзка върху превръзка · цвят на кръвта | q-ptp-019, 039, 040 | Класическа педагогика на първата помощ. Заземено е ДЕЙСТВИЕТО, не класификацията. Всеки ред го казва на ученика. |

---

## 5. Как да проверите сами (без мрежа)

Изтеглените оригинали стоят на диска, така че всяка проверка е офлайн:

```
content/medical/tools/erc2025_layperson.txt   ERC 2025 Guidelines for Everyone
content/medical/tools/rcuk_bls.txt            RCUK 2025 Adult Basic Life Support
content/medical/tools/rcuk_fa.txt             RCUK 2025 First Aid
content/medical/tools/bchk_bls.txt            БЧК — основна мед. помощ и АВД
content/medical/tools/bchk_page5.txt          БЧК — основните стъпки
```

Проверка на цитат по локатор — например дълбочината на натиска:

```bash
sed -n '446p' content/medical/tools/erc2025_layperson.txt   # ERC: 5 to 6 cm
sed -n '119p' content/medical/tools/rcuk_bls.txt            # RCUK: at least 5 cm, not more than 6 cm
```

Пълна повторна проверка на регистъра (тегли наново и хешира):

```bash
cd content/medical/tools && bash fetch.sh && node build-sources.mjs .. \
  && node build-claims.mjs .. && node verify-claims.mjs ..
```

> **Бележка за хешовете.** Три източника (lex.bg, resus.org.uk/first-aid, firstaid.redcross.bg) НЕ хешират
> стабилно на ниво сурови байтове — сървърът вгражда токен за всяка заявка. Затова всеки източник носи
> и `rawSha256`, и `textSha256` над един детерминистичен извличач. **Проверката ползва текстовия хеш.**

---

## 6. Статус

Нито един от 29-те реда не е `approved` и **никой агент не може да го направи.** `content/SCHEMA.md`:
генератор никога не пише `approved` — тази дума значи, че човек е прочел реда, и е вярна само когато
`content/review/approvals.json` носи подписа му. Таванът за автоматика е `machine-checked`.

Затова двата теста, които тази вълна трябваше да отпуши, остават червени по една и съща причина —
проверено отново на 2026-08-04 след клиничния преглед:

- `src/modules/exam/__tests__/content-bank.test.ts` → `REVIEW_DEBT: ptp-i-parva-pomosht: only 31/64 (48%) approved`. Прагът е `MIN_APPROVED_SHARE = 0.5`.
- `src/modules/lesson/__tests__/compose.test.ts` → `l-accidents-first-aid` няма нито един quiz beat, защото quiz-ът тегли САМО `approved` въпроси (`modules/lesson/quiz.ts:42`), а четирите концепции са **0 от 29**.

И двата се отпушват само с подпис на човек на `/review`. Прагът не се пипа — това е изрично записано в
самия тест: „The remedy for a red run here is a review pass on the named topic — never a threshold edit.“

**Гейтът, както е измерен днес** (`cd platform`):

| Команда | Резултат |
|---|---|
| `npm run validate:content` | ✅ OK — 1089 въпроса: 0 draft / 0 machine-checked / 290 needs-review / 799 approved; подписани 0; таван 837; 0 просрочени подписа |
| `npm run test:tools` | ✅ 157 теста, 0 паднали |
| `npx tsc --noEmit` | ❌ 1 грешка, чужда лента (`modules/sim/runtime/__tests__/…`) |
| `npx vitest run --maxWorkers=4` | ❌ 10 паднали от 10 886 (718 файла, 7 паднали) |

От десетте паднали теста: **2 са ЗАЩИТЕНИ** (горните два, чакат подпис) · **3 са регресия по
`api/review/route.test.ts`** (виж §7.3, находка 6) · **1 е `tsconfigHygiene`** (в `tsconfig.json` са
влезли `.next-harness/**` пътища — чужда лента) · **4 са симулаторни** и принадлежат на лента, която
пишеше по време на този пробег (`contracts.ts`, `advisor.ts`, `worldRuntime.ts`, `traces/*` се промениха
между два последователни `tsc` пробега). Симулаторните числа са моментна снимка на движеща се работна
директория и не бива да се четат като стабилни.

**Капанът по доклад 91 §4.17 НЕ е задействан.** Одобрените в темата са 31/64 преди и след вълната.
Одобряването само на четирите правни реда (q-ptp-009, 044, 050, 052) би вдигнало темата на 35/64 (55 %),
би минало прага и би направило `content-bank.test.ts` зелен, докато всички 29 медицински реда остават
скрити от изпита. Нито един статус не е повишен до `approved`.

---

## 7. Какво блокира подписването — прочети това ПРЕДИ да отвориш /review

### 7.0 ✅ ЗАТВОРЕНО — и 29 от 29 реда вече се появяват в конзолата

**Беше:** дванайсет реда бяха повишени от `needs-review` на `machine-checked` — честно повишение, бяха
минали всяка автоматична проверка. Но `listFlaggedQuestions` имаше само две кошници и `machine-checked`
не попадаше в НИТО ЕДНА. Нищо не хвърляше грешка, никакво число не ставаше отрицателно — екранът просто
показваше 17 от 29 реда и изглеждаше напълно здрав, докато доклад 91 §4.17 казваше на основателя писмено
да отвори `/review` и да одобри всичките 29. От двете най-опасни концепции, `c-bleeding-control` и
`c-victim-handling`, на екрана оставаше точно по един ред от седем.

**Сега** — преброено независимо срещу `content/questions/*.json` + `content/review/approvals.json`
(0 подписа), с маршрутизацията на `dispositionOf` възпроизведена ред по ред:

| | брой |
|---|---|
| първа помощ, общо | **29** |
| в кошницата „За поправка“ (`needs-review`) | **29** |
| недостижими от която и да е кошница | **0** |

По концепции: `c-first-aid-priorities` 9/9 · `c-cpr-basics` 6/6 · `c-bleeding-control` **7/7** ·
`c-victim-handling` **7/7**. Цялата банка: 1089 реда = 290 `needs-review` + 799 неподписани `approved`,
0 `machine-checked`, 0 `draft`, сумата на кошниците = 1089 = общия брой.

**Поправката не е „добави machine-checked в предиката“, и това е важното.** Правилото в
`platform/src/modules/content-admin/queues.ts` е ТОТАЛНО по конструкция: всеки ред попада в точно една
кошница или е подписан от човек. Проверено чрез МУТАЦИЯ, не по описание — с изтрит `case "machine-checked"`:

```
vitest queues.test.ts   → 4 от 12 теста ЧЕРВЕНИ, водещият казва точно това:
  „these statuses reach no queue and would vanish from /review: machine-checked"
tsc --noEmit            → queues.ts(116,80) TS2366: Function lacks ending return statement
```

След възстановяване (проверено по sha256, байт в байт): 12/12 зелени. Тестът чете списъка със статуси
от `ContentStatusSchema.options`, а `schemas.ts:331` доказва с `Assert<Equals<…>>`, че zod-енумът е същият
съюз, по който `dispositionOf` прави switch — тоест изброяването не може да се разсинхронизира с кода.

> ⚠️ **ЕДНО ОГРАНИЧЕНИЕ, което никой не беше премерил.** Банката днес съдържа **0** реда с
> `machine-checked`. Затова преброяването върху истинската банка в `queue.test.ts` — онова, чийто
> коментар се самонарича „THE ALARM“ — НЕ МОЖЕ да хване тази регресия днес; то захапва едва когато
> такъв ред съществува. Носещата защита е чистият модулен тест `queues.test.ts`. Никой да не го
> „опростява“ с довода, че `queue.test.ts` го покрива.

### 7.1 ⛔→✅ КЛАСНАТА СТАЯ ГОВОРЕШЕ ОБЪРНАТОТО УКАЗАНИЕ — и това не беше в урочния файл

> **СЪСТОЯНИЕ КЪМ 2026-08-05: ЗАТВОРЕНО, ПРОВЕРЕНО ЧРЕЗ ИЗПЪЛНЕНИЕ.** Разделът по-долу се запазва
> ДОСЛОВНО такъв, какъвто беше — той е записът какво точно е било изричано. Какво е сега, защо всяко
> четене на кода стигаше до грешния извод и какво прави повторението невъзможно: **виж §8**.
> §8 съдържа и остатъците, които НЕ са затворени — включително един път, който никоя от предишните
> вълни не е назовала.

`content/lessons/l-accidents-first-aid.json` беше помирен: всичките седем обръщания са затворени в него.
**Но този файл още не се зарежда от никакъв код.** Гнездото за авторски разказ
(`platform/src/modules/lesson/narration.ts`) няма регистриран доставчик, тоест урокът, който ученикът
чува днес, се СГЛОБЯВА от `content/concepts.json` — а concepts.json не е пипан от нито една вълна.

Веригата, ред по ред:

```
compose.ts        → всяка концепция получава beat със say: [{ src: "concept", conceptId }]
resolve.ts:72-76  → case "concept": return concept.summaryBg   ← БЕЗ проверка за approved
narration.ts:87   → авторският текст СЕ ПРОВЕРЯВА (status !== "approved" → null)
```

Тоест авторският текст минава през гейт, а сглобеният — не. Измерено чрез изпълнение на истинския
резолвер върху истинското съдържание (`allLessons()` + `resolveBeat()`), ето какво изрича класната стая:

| Beat | Изречено ДНЕС (от `concepts.json`) | Банката вече градира |
|---|---|---|
| `b4-explain` | „Дишащ, но в безсъзнание човек **се поставя в стабилно странично положение**“ | `q-ptp-022` / `q-ptp-037`: НЕ го обръщаш след удар |
| `b1-explain` | „обезопаси, **огледай пострадалите, звънни на 112**“ + „леко разтърсване на раменете“ | `q-ptp-013`: 112 е ПРЕДИ оценката на дишането |
| `b2-explain` | „**Ако пострадалият не диша**, започваш сърдечен масаж“ · „Не спирай до идването на помощ“ | прагът е „не диша НОРМАЛНО“; `q-ptp-017` брои и изтощението на спасителя |
| `b3-explain` | директен натиск, забит предмет — без обръщане | — |

**И четирите концепции носят и декоративния `ЗДвП чл. 123`** под чисто клинични обобщения — същият
дефект, който тази програма съществува да изтрие, един файл встрани.

**Броят въпроси, които сглобеният урок задава днес: 0.** `isLessonEligible` (`modules/lesson/quiz.ts:42`)
тегли само `approved`, а четирите концепции са 0 от 29. Значи ученикът чува обърнатото указание и не
получава нито един въпрос, който да го поправи. Това е и причината `compose.test.ts` да е червен.

**Това е реалната опасност в целия пакет, и предпоставката „противоречието е латентно“ не важи.**
Латентно е за урочния файл. За `concepts.json` е живо: обърнатото указание се изрича на ученик днес и
ще продължи да се изрича като резервен вариант, докато урокът стои неподписан.

**Поправката е в друг файл и в друга лента:** `content/concepts.json` → `c-victim-handling.summaryBg`,
`c-first-aid-priorities.summaryBg`, `c-cpr-basics.summaryBg`, плюс махане на `ЗДвП чл. 123` от четирите.
Алтернативата — гейт на `resolveSay` case „concept“ — е по-голяма промяна и оставя урока без глас.

### 7.2 96 % от цитатите ще изглеждат непроверени в конзолата — макар всички да са верни

Нито един от 29-те реда не носи `sourceRefs`. Схемата, регистърът (`content/medical/`) и панелът за
източници в `/review` бяха построени точно за тези редове — но редовете не приеха полето. Затова
`checkQuotedClaims` няма към какво да сравни цитатите от ERC/RCUK:

- цитирани откъси в 29-те реда: **114**
- разрешими от конзолата днес: **4** — краткото „ако това не представлява опасност“ от ЗДвП (2), плюс
  двете дословни извадки, които вълната „кавичките не са заслужени“ добави: чл. 124, т. 1 в `q-ptp-013`
  и чл. 123, ал. 1, т. 2, б. „в“ в `q-ptp-017`
- ще се покажат като НЕПРОВЕРЕНИ: **110 (96 %)** — всичките английски, от ERC/RCUK

**НО — и това е новото — нито един от тях не е непроверим.** Клиничният преглед прекара всичките 114
откъса през същия `quotedSpans` + `normaliseForMatch`, който конзолата ползва, но срещу изтеглените
текстове на диска, и с допълнително изчистване на артефактите на извличача (BEL знаци и разделящи
интервали в главните букви — „n \x07B\x07 efore anything else“ — плюс пренесени редове):

| | брой |
|---|---|
| **латински (английски) откъси, ненамерени дословно** | **0 от 61** |
| кирилски откъси, намерени дословно (ЗДвП, БЧК, Наредба № 24, КРС) | 11 от 53 |
| кирилски откъси, ненамерени | 42 — всичките са или собствен глас на реда („чакай да спре само“, „в безсъзнание е, значи го местя“), или БЪЛГАРСКИ ПРЕВОД на английско изречение вътре в кавички |

Тоест целият английски корпус е верен; конзолата просто няма с какво да го сравни. Поправката е
механична — `content/medical/claims.json` вече свързва всяко твърдение с id-тата на въпросите, така че
се добавя `sourceRefs: [{ sourceId, ref, claimId }]` на всеки от 29-те (`q-ptp-058` вече го има).

Остава ОТДЕЛЕН дефект, от същия клас като хибридния цитат от чл. 124: в девет реда — `q-ptp-018`,
`019`, `020`, `021`, `040`, `041`, `042`, `063`, `064` — изречения на ERC/RCUK стоят в БЪЛГАРСКИ ПРЕВОД
ВЪТРЕ в кавичките, с приписване на източника. Проверено едно по едно: всички преводи са верни
(`Minimise movement of the neck.` = „сведи движението на врата до минимум“;
`Never force an uncooperative person into any position, as this may exacerbate an injury.` =
„Никога не насилвай несътрудничещ човек в каквото и да е положение, защото това може да влоши
травмата.“). Но кавичките твърдят дословност, която е невъзможна за проверка, защото източникът не е
на български. Същата поправка като в `q-ptp-022`: оригиналът вътре, преводът извън.

Две дребни несъответствия, проверени и обявени за безобидни, за да не ги гони пак някой:
`q-ptp-036` цитира БЧК „най-малко 5 см (макс. 6 см)“, а извлеченият текст носи латинско `c` в „6 cм“
(`bchk_bls.txt:89`); `q-ptp-021`/`q-ptp-063` цитират „пряка, неконтролируема опасност“, а
`bchk_page5.txt:38` има запетая след „неконтролируема“. И двете разлики са в ИЗТОЧНИКА.

### 7.3 Дребните, но истински дефекти, открити при този преглед

- ✅ **ЗАТВОРЕНО — `q-ptp-013` цитираше ЗДвП чл. 124 НЕДОСЛОВНО.** Редът пишеше „да вземеш … да окажеш
  … за него“; законът казва „да вземе … да окаже … за него“ (трето лице). Глаголите бяха пренаписани
  във второ лице вътре в кавичките, а „за него“ остана в третото — изречение, което не съществува в
  никой текст, написано ВЪТРЕ във вълната, която точно този клас дефект закрива. Сега в кавичките стои
  дословният текст на т. 1, а второто лице е ИЗВЪН тях, заедно с едно изречение, което казва на ученика
  защо цитатът звучи като за трети човек. `checkQuotedClaims` вече го разрешава срещу чл. 124.
  **Проверено повторно, знак по знак, срещу `content/law/acts/zdvp.json`** — съвпада; и обратно, чл. 123,
  ал. 1, т. 2, б. „в“ казва „мерки за БЕЗОПАСНОСТТА“, а чл. 124, т. 1 — „мерки за ОСИГУРЯВАНЕ
  безопасността“, тоест всеки ред трябва да цитира своя член, и го прави.
  Пази го тест: `platform/src/modules/content-admin/evidence.test.ts` → „first-aid rows quote Bulgarian
  statute verbatim“ (всеки кирилски откъс в кавички трябва да се намери дословно в цитиран от реда
  член; плюс изричната забрана за „да вземеш мерки“ / „да окажеш помощ“ в целия файл).
- ✅ **ЗАТВОРЕНО — `q-ptp-017` цитираше „Everyone can learn how to perform CPR“**; източникът
  (`rcuk_bls.txt:111`) пише „Everyone can learn how to perform cardiopulmonary resuscitation (CPR).“
  Сега стои дословно. По-важното: този цитат носеше САМ твърдението „не ти трябва разрешение или
  диплома“, което е ДРУГО твърдение — „всеки може да се научи“ не е „всеки има право“. Редът вече
  разделя двете: медицинската половина се заземява на `rcuk_bls.txt:111`, `erc2025_layperson.txt:411`
  („These initial life-saving actions can be performed by anyone…“) и `rcuk_bls.txt:128`; юридическата
  половина се отговаря от българското право, защото ERC изрично препраща натам („…local ‘Good
  Samaritan’ and ‘Duty to Respond’ laws, which vary between locations“, `erc2025_layperson.txt:745`).
  Редът вече цитира ЗДвП чл. 123, ал. 1, т. 2, б. „в“ и чл. 124, т. 1 — задължение, не разрешение.
- ✅ **ЗАТВОРЕНО — `q-ptp-056` и `q-ptp-022` вече казват какво ги различава.** И двата реда носят един
  и същ разграничител, изписан с главни букви: ЗНАЕШ ЛИ ВЕЧЕ, ЧЕ ЧОВЕКЪТ ДИША НОРМАЛНО. 056 (не знаеш)
  обяснява, че дишане през запушен път не се преценява, затова първо отваряш — и добавя какво се
  прави в обратния случай. 022 (знаеш) обяснява, че пътят вече работи, затова приоритетът се обръща
  към врата — и цитира общата хватка на ERC за случая, в който още не знаеш. Всеки ред препраща към
  другия. Действието не е сменяно; сменена е само липсата на „защо“ (THEO-4). **Остава отворено в
  урока:** разграничителят го няма в `l-accidents-first-aid.json`.
- ✅ **ЗАТВОРЕНО — `q-ptp-061` вече не приписва „полагаш го“ на насока.** Редът разделя трите действия:
  „Make the person comfortable.“ и наблюдението са дословни от ERC; топлината — дословна; а „лежи,
  вместо да ходи“ е обявено изрично като практически прочит на „удобно“ плюс
  „Do not move the person unless they are in an unsafe situation.“, а НЕ като отделно изречение от
  насоките. Добавен е и абзац, който казва, че това НЕ е старата поза по гръб с вдигнати крака —
  точно твърдението, което `q-ptp-035` отрича. `q-ptp-035` е допълнен от своята страна със същото
  разграничение (и с поправка: „по гръб“ се среща в изданията 2025 г. на две места — при масаж и при
  обръщане на човек, който лежи по лице, за да му се отвори дихателният път — и двете заради дишането,
  не заради шока).
- ✅ **ЗАТВОРЕНО — `med-extrication-technique`** вече е `ungrounded-teaching-material-only` с четири
  дословни цитата от БЧК, а `build-claims.mjs:397` отказва да излъчи `ungrounded-no-reachable-source`
  на claim, който носи цитати — статусът стана опровержим и не може да загние пак.

**ОТВОРЕНИТЕ находки на клиничния преглед — по спешност:**

1. ⛔ **`content/concepts.json` изрича обърнатото указание на ученик ДНЕС.** Виж §7.1. Това е
   единственото, което стига до истински 17-годишен преди подпис.
2. ⚠️ **`q-ptp-017`, опция (b): градирано ВЯРНО „щом установиш, че пострадалият НЕ ДИША“**, докато
   собственото обяснение на реда казва, че прагът е „не диша НОРМАЛНО“. Агоналното хъркане Е дишане за
   неопитно око; това е точно моментът, в който хората задържат масажа. Текстът на опцията трябва да
   се поправи преди подпис. (Същата неточност, но само в СТЪБЛОТО, е в `q-ptp-016` и `q-ptp-060` —
   по-малко носеща, защото не е градирано твърдение.)
3. ⚠️ **`q-ptp-015`, опция (d): „внимателно РАЗТЪРСВАШ раменете му“** — „shake“ = 0 срещания и в ERC
   2025, и в RCUK BLS 2025; единственият източник е БЧК (`not-a-grounding-source`), докато RCUK казва
   за ПТП „Minimise movement of the neck.“. Редът признава думата „рамо“, но не и глагола.
4. ⚠️ **`q-ptp-022`: изключението „тогава ГО ОБРЪЩАШ“ стъпва на `rcuk_fa.txt:232`,** който покрива само
   човек, лежащ ПО ЛИЦЕ, и го обръща ПО ГРЪБ. Действието е клинично правилно, цитатът покрива една
   трета от изброените случаи. Същото изречение стои и в урока.
5. **`med-recovery-position` е застоял И ФАКТИЧЕСКИ НЕВЕРЕН.** Статусът е `contested-content-affected`,
   а бележката към конфликта твърди „q-ptp-022 и q-ptp-037 инструктират точно това“ — вече не е вярно,
   и двата ключа са обърнати по ERC/RCUK 2025. Регистърът не бива да се редактира, за да съвпадне със
   съдържание, чието клинично решение не е ратифицирано: **това е решение на основателя**, не
   редакционна поправка. (Днес не се вижда в конзолата, защото 28 от 29-те реда нямат `sourceRefs` —
   в мига, в който ги получат, застоялата бележка ще застане пред рецензента.)
6. **`src/app/api/review/route.test.ts` е ЧЕРВЕН и това не е дългът по преглед.** `route.ts` вече вика
   `parseQueue`, но тестът подменя (`vi.mock`) `@/modules/content-admin` изцяло с три функции и `parseQueue` не е
   сред тях → `GET /api/review` хвърля вместо да върне отговор (3 теста). В продукцията няма проблем —
   `parseQueue` наистина се експортира (`index.ts:53`). Регресия от вълната за кошниците, невидима за
   нейния собствен гейт, защото той пускаше само `src/modules/content-admin`.

---

## 8. Класът дефект „изричаме непроверено" — какво беше, защо беше невидим, какво го прави невъзможен

> **Как е проверено всичко в този раздел.** Чрез ИЗПЪЛНЕНИЕ на истинския резолвер върху истинското
> съдържание — `allLessons()` + `resolveBeat()` през вградения `ContentRepo`, всичките 54 урока, 732
> излъчени изречения — а не чрез четене на кода. Това разграничение е причината дефектът изобщо да
> бъде намерен: всеки, който ЧЕТЕШЕ кода, стигаше до извода, че пътят е защитен.

### 8.1 Какво изричаше класната стая — и какво изрича сега

Един и същ харнес, преди и след. Beat `b4-explain` на `l-accidents-first-aid`:

**ПРЕДИ** (от `content/concepts.json` → `c-victim-handling.summaryBg`, изречено дословно на ученик):

> „Пострадал не се мести освен при пряка опасност — пожар, риск от нов удар — заради възможна травма
> на гръбнака. **Дишащ, но в безсъзнание човек се поставя в стабилно странично положение**; каска се
> сваля само ако пострадалият не диша."

Срещу ERC 2025, `content/medical/tools/erc2025_layperson.txt:768`, дословно:

> „In cases of not normal breathing or trauma, do NOT move the person into the recovery position."

и RCUK First Aid 2025, `content/medical/tools/rcuk_fa.txt:149`, дословно:

> „In cases of agonal breathing or trauma, do NOT move the person into the recovery position."

ПТП е травма по определение. Указанието не беше приблизително — то беше **обратното** на насоката,
изричано на седемнайсетгодишен, върху сценарий, в който изпълнението му превръща оцеляла катастрофа в
трайна парализа.

**СЕГА** (същият beat, същият харнес):

> „[frame] Тази част още се проверява от преподавател и няма да ти я разказвам, докато не е потвърдена.
> По-добре да ти кажа „не знам сигурно", отколкото да те науча на грешното. Ще се върнем на нея."

Същото за `b1-explain` (отмененият ред на обаждането от 2021 г. + „разтърсване на раменете"),
`b2-explain` (прагът „не диша" вместо „не диша НОРМАЛНО", без изтощението на спасителя) и `b3-explain`.

**Пълната картина на урока днес, измерена:** 6 beat-а, `sayCount=1` на всеки, от които 4 учебни beat-а
са изцяло премълчани, `beatMaterials: <none>` навсякъде, „Защо е така?" не се предлага изобщо (чипът
се маха, вместо да е бутон, чийто единствен изход е отказ), и **0 зададени въпроса** в целия урок.

**Нула изтичания.** Забраненият набор е построен от `content/` — концепции без валиден пин, въпроси
и знаци без `approved` — тоест никога от гейта, който проверява. 374 забранени низа срещу 732 излъчени
изречения от 54 урока: **0 съвпадения**.

### 8.2 Защо ВСЯКО четене на кода стигаше до извода, че е защитено

Три причини, в нарастващ ред на това колко трудно се вижда всяка:

1. **Съседната врата ИМАШЕ гейт.** `narration.ts:87` отказва авторски текст, който не е `approved`.
   Който погледнеше „как се говори на ученик", виждаше проверка — и тя беше истинска. Само че
   доставчик за този път **не е регистриран никъде в продукцията**: `setLessonNarrationProvider` се
   вика единствено от `__tests__/narration.test.ts` (проверено с grep върху цялото `platform/`).
   Тоест **гейтнатият път мълчеше, а неговият негейтнат съсед говореше всичко**.

2. **Документацията твърдеше свойството като доказано.** `modules/lesson/index.ts` пишеше, че `say`
   бидейки референция „е начинът, по който ADR-002 е удовлетворено по целия път на възпроизвеждане
   БЕЗ НИТО ЕДНА проверка по време на изпълнение", а `types.ts` — че е „структурно невъзможно" урок
   да носи непрегледано твърдение. Първото изречение е вярно наполовина и точно тази половина е
   капанът: **beat не може да СЪДЪРЖА непроверено твърдение, но може спокойно да СОЧИ към такова.**
   И двете изречения вече са поправени и сочат към `clearance.ts`.

3. **Файлът, към който сочеше, няма поле за статус.** `content/SCHEMA.md` § concepts.json: `id`,
   `topicId`, `titleBg`, `titleEn`, `summaryBg`, `dependsOn`, `lawRefs`, `difficulty` — и нищо друго.
   Затова „сложи същата проверка като в narration.ts" **няма как да се напише**: тя се свежда или до
   „всяко обобщение пада и всичките 54 урока онемяват", или до „не се проверява нищо". Това е
   истинската причина дупката да оцелее толкова дълго — не невнимание, а **липса на нещо, срещу което
   да се пише `if`**.

### 8.3 Какво прави повторението невъзможно

**(1) Таблица, не `if`.** `SAY_CLASS` е типизирана `Record<SayRef["src"], SayClass>`. Нов вид източник
в `types.ts` **не компилира**, докато някой не каже какъв допуск има. `if` в `resolveSay` затваря
случая, за който е написан; следващият `case` не наследява нищо — а `question` и `sign` вече седяха в
същия `switch`, еднакво негейтнати, чакайки урок, който да ги изрече.

**(2) Хеш, не списък с идентификатори.** Класът `carried` съществува точно защото `concepts.json` няма
статус: 145 обобщения се носят СЪЗНАТЕЛНО и са пинати по sha256 на самото изречение
(`clearanceCarry.ts`). Списък само с идентификатори щеше да отвори наново четирите първопомощни
концепции в мига, в който основателят подпише 29-те въпроса — одобряването на ВЪПРОС щеше мълчаливо да
преупълномощи ОБОБЩЕНИЕ, което никой не е препрочел. Хешът държи двете решения разделени, защото те са
две решения.

**(3) Правилото на замразяването, приложено веднъж:** носи се само където поне един въпрос от банката,
проверяващ тази концепция, е бил `approved` в момента на замразяването. Седем концепции падат и
**отсъстват** — не са в черен списък, отсъстват, защото по подразбиране се мълчи и отсъствието не иска
поддръжка. Четирите първопомощни са 0 одобрени от 29 и днес (преброено: 31 одобрени и 33 needs-review
сред 64-те `q-ptp-*` реда; всичките 33 неодобрени, които падат върху четирите концепции, са именно
29-те).

**(4) Отказът е ВИДИМ.** `recentWithheldSources()` е пръстен с (урок, beat, източник, идентификатор,
причина) — никога потребител, ADR-004. `courseClearance()` е преброяването от истинския резолвер, а не
от флагове в съдържанието. Измерено сега: 7 записа, всички `concept-not-carried`; четири урока с поне
един премълчан beat (`l-accidents-first-aid` 4 от 4, `l-admin-newdriver-police` 1 от 3,
`l-speed-distance` 1 от 4, `l-fitness-alcohol-drugs` 1 от 4); останалите 50 урока — недокоснати.

**(5) Тест, който не проверява сам себе си.** `__tests__/clearance.test.ts` прекарва всичките 54 урока
през ИСТИНСКИЯ резолвер и сравнява всяко излъчено изречение със забранен набор, построен от `content/`.
Ако някой изтрие гейта, тестът пада с истинското българско изречение, което ученикът би чул, отпечатано
в съобщението за грешка.

**(6) Инструментът е по-евтин от заобикалянето.** `node scripts/freeze-lesson-carry.mjs --check` отговаря
за секунда; без флагове препинва и **отпечатва цялото ново изречение** за всеки пин, който мести.
Правилното действие трябва да струва по-малко от изтриването на гейта, иначе гейтът се изтрива.

### 8.4 ⛔ ОСТАВА ОТВОРЕНО — и първото не е било назовавано от никого

> **Статус на целия §8.4 към 2026-08-05.** Пет от седемте находки по-долу са ЗАТВОРЕНИ и това е
> проверено ЧРЕЗ ИЗПЪЛНЕНИЕ, не по описание — виж §9.2 за числата и §9.6 за гейта. Оставащите две
> (8.4.4/8.4.5 — клиничните етикети) са затворени в текста, но в ПРЕМЪЛЧАНО състояние: четирите
> обобщения са пренаписани и всяко клинично изречение е проверено дословно (§9.5), ала нито едно от
> четирите не е пинато, тоест днес не стига до ученик и няма да стигне, докато човек не ги прочете.

#### 8.4.1 ✅ ЗАТВОРЕНО · `modules/tutor` заобикаля гейта изцяло

`modules/lesson/clearance.ts` е гейт на **модула lesson**. `modules/tutor/retrieval.ts` има собствено
извличане и **не се допитва до него**:

```
retrieval.ts:180-188   repo.concepts()  → bodyBg: c.summaryBg      ← без проверка
retrieval.ts:190-198   repo.questions() → bodyBg: q.explanationBg  ← без проверка за status
```

Две врати, и двете измерени чрез изпълнение:

- **Самостоятелната страница `/tutor`** (`askTutorAction` → `retrieveGroundingForTurn` →
  `rankMaterials(topicId=null)`). На въпрос „Как се мести пострадал в безсъзнание след катастрофа?"
  връща `concept:c-victim-handling` с резултат **10** — концепцията, която класната стая отказва да
  изрече. На „Как се спира силно кръвотечение?" → `c-bleeding-control` (8.1). На „Кога се прави
  сърдечен масаж?" → `c-cpr-basics` (6).
- **Собственият STOP/ASK на класната стая.** `interrupt.ts` подава Tier-1 материали, които СА гейтнати
  (`beatMaterials` вика `conceptClearance`) — но `service.ts:227 lessonGrounding()` след това **разширява**
  с `retrieveMaterialsInTopic`, което не е гейтнато. Репликирано ред по ред: на всеки от четирите
  първопомощни beat-а `tier1=0`, `room=6`, **`tier2=6`, и шестте са `needs-review`** (`q-ptp-022`,
  `q-ptp-037`, `q-ptp-056`, `q-ptp-061`, `q-ptp-057`, `q-ptp-013`).

**Днес това не стига до ученик**, защото `isTutorEnabled()` връща `false` без `ANTHROPIC_API_KEY`, а
това хранилище е в такова състояние (проверено: `isTutorEnabled() === false`). **Но това е
конфигурационен ключ, не гейт.** В мига, в който на staging или в продукция има ключ, вратата се отваря.
Правилната поправка е `retrieval.ts` да филтрира по същите функции (`conceptClearance`,
`questionClearance`, `signClearance`) — не да се разчита на липсващ ключ.

> ✅ **Направено точно това.** `retrieval.ts clearedCandidates()` е ЕДИНСТВЕНОТО място, в което ред от
> банката става кандидат, и двата класирани пътя минават през него. Функциите се ИМПОРТИРАТ от
> публичния барел на `@/modules/lesson`, а не са преписани — затова замразяването на цитатите, което
> влезе в `clearance.ts` по-късно, се наследи без нито ред промяна тук. Преизмерено на 2026-08-05:
> трите въпроса връщат **0 / 3 / 0** материала от банката, а трите тройки не съдържат нищо
> първопомощно — трите са одобрени редове извън темата (§9.2, ред „D").

#### 8.4.2 ✅ ЗАТВОРЕНО · Пинът покрива `summaryBg`, но НЕ покрива `lawRefs` — а цитатът се показва на ученика

`conceptClearance` хешира само `concept.summaryBg`. Цитатът обаче стига до екрана:
`lessonToRoom.ts:145` строи низа `${first.act} ${first.ref}`, а `Transcript.tsx:88` го изписва.

Доказателство от работното дърво: `c-hit-and-run` смени `lawRefs` от `НК чл. 343?` на
`НК чл. 343, ал. 3` — обобщението не е пипано, пинът не е мръднал, **и концепцията остава cleared**.
Тоест правната половина на една концепция е напълно негейтната.

**Последицата вече е на екрана: 45 различни низа с въпросителен знак се изписват дословно на ученици**
(преброено върху истински излъчени изречения: 254 изречения носят цитат, 113 различни низа, 45 от тях
съдържат „?"). Примери: `ЗДвП чл. 25?` (`l-priority-situations/b3-explain`), `ППЗДвП чл. 31?`
(3 урока), `Наредба № 37 учебна документация?` (3 урока), `ЗБЛД чл. 51?`. Във файла общо 59 концепции
носят 60 такива цитата. Това е точно същият теч „не сме сигурни в закона, който преподаваме", заради
който съществува `sanitize.ts` — но той не е в квадратни скоби и минава непокътнат.

> ✅ **`clearanceCitations.ts` пинва цитатите отделно от изреченията** и хешира точно низа, който
> `lessonToRoom.ts:145` строи и `Transcript.tsx:88` изписва — тоест промяна, която не може да стигне
> до ученик, не може и да занеми урок. Преброено наново върху ИСТИНСКИ излъчени изречения на
> 2026-08-05: **275 цитата, 130 различни низа, 0 с „?"** (беше 45 от 113). Същото в цялата
> `concepts.json`: 213 препратки, **0 с „?"**. Виж обаче §9.4: проверката, която пази това свойство,
> има точно определена дупка и тя е доказана чрез изпълнение.

#### 8.4.3 ⚠️→ ЧАСТИЧНО · Два акта се цитират уверено, без да ги притежаваме

`content/law/acts/` съдържа `zdvp`, `naredba-24`, `naredba-38`, `naredba-iz-2539`. Не съдържа **ППЗДвП**
и **Наредба № РД-02-21-1/2023** — а `corpus.test.ts:188` дори утвърждава, че
`actIdForActName("Наредба РД-02-21-1/2023")` е `null` **по проект**. Въпреки това:

- `c-railway-crossing` цитира `ППЗДвП чл. 109` за целия списък „кога спирането е ЗАДЪЛЖИТЕЛНО" отвъд
  случая без бариери. ЗДвП чл. 51, ал. 3 покрива само прелез БЕЗ бариери (проверено дословно в
  `zdvp.json`); останалите случаи (спуснати/спускащи се/вдигащи се бариери, мигаща червена, приближаващ
  влак) стъпват изцяло на акт, който го няма в хранилището.
- `c-roundabout-rules` цитира `Наредба № РД-02-21-1/23.11.2023 чл. 61, ал. 5` за твърдението, че Б3 не
  може да се поставя на вход на кръгово.

И двете са **без** въпросителен знак, което ги прави да изглеждат по-проверени от цитатите в 8.4.2.
Това е по-лошото от двете състояния: „?" поне признава несигурност.

> **Проследени поотделно на 2026-08-05, защото не са в едно и също състояние.**
>
> - `ППЗДвП чл. 109` — **вън от концепциите изцяло.** 0 срещания в `concepts.json`, 0 излъчени.
>   `c-railway-crossing` сега цитира ЗДвП чл. 52 и чл. 53, които хранилището притежава и които
>   наистина носят клаузите за спуснати бариери и мигаща червена. Остава на **3 реда от банката**
>   (`q-krastovishta-017`, `-054`, `-066`) — и трите `needs-review`, тоест гейтнати навсякъде, където
>   класната стая, изпитът и туторът четат.
> - `Наредба № РД-02-21-1/23.11.2023 чл. 61, ал. 5` — **вън от концепциите, но ВСЕ ОЩЕ СЕ ИЗЛЪЧВА.**
>   0 срещания в `concepts.json`; 9 реда от банката го носят, единият (`q-predimstvo-021`) е
>   `approved`; и един низ стига до екрана от корпус, който НИТО ЕДИН пин не покрива — каталога на
>   сценариите (§9.3). Точно затова тази находка е ЧАСТИЧНА, а не затворена: акт, който не
>   притежаваме, с номер на член, стои на екран на ученик и днес.

#### 8.4.4 ⚠️ Три клинични твърдения загубиха етикета си при пренасянето от банката в концепциите

Банката прави правилното нещо. `q-ptp-039` казва дословно на ученика:

> „Самото правило „превръзка върху превръзката" е **утвърдена практика на първата помощ, а не буквален
> текст от насока** — казваме ти го така, вместо да го пр[одадем за насока]."

`c-bleeding-control.summaryBg` обаче го изрича като факт, без етикет и с добавена физиология:

> „Избие ли кръв през превръзката, не я сваляш **(тя вече е част от съсирека)** — слагаш нова отгоре
> и натискаш още по-силно."

**Проверен отрицателен резултат:** „do not remove" / „soaked" / „on top of" / „clot" в контекст на
кървяща рана = **0 срещания** в `erc2025_layperson.txt`, `rcuk_bls.txt`, `rcuk_fa.txt`. Стълбицата на
RCUK 2025 (`rcuk_fa.txt:113, 235-245`) е: директен натиск → хемостатична превръзка, притисната/натъпкана
→ **турникет**. Стъпало „втора превръзка отгоре" в изданията от 2025 г. няма.

Същото за забития предмет („`impal`/`embedded`/`object` в рана" = 0 срещания — `q-ptp-019` го ЗАЯВЯВА,
концепцията не) и за каската („`helmet`" = 0 срещания и в трите издания — `q-ptp-020` го заявява,
`c-victim-handling` не).

**Заземеното е заземено, и то дословно** — проверено едно по едно: натиск и турникет
`rcuk_fa.txt:240-245` (включително „5-7cm above the injury, but not over a joint", „Write the time",
„Do not release"); 100–120/min и 5–6 cm `erc2025_layperson.txt:446`; пълно изправяне на гърдите
`rcuk_bls.txt:192`; 30:2 `erc2025_layperson.txt:449`; само натискания `erc2025_layperson.txt:453`;
трите изхода `rcuk_fa.txt:141`; агонално дишане `erc2025_layperson.txt:420` и `rcuk_bls.txt:160`;
до 10 секунди `erc2025_layperson.txt:792`; стискане на рамото `erc2025_layperson.txt:816`; обаждане
преди оценка на дишането и високоговорител `rcuk_bls.txt:166-167`, `rcuk_fa.txt:110`; неподвижен врат и
jaw-thrust `rcuk_fa.txt:231`; обръщане ПО ГРЪБ на човек, лежащ ПО ЛИЦЕ, `rcuk_fa.txt:232`.

#### 8.4.5 ⚠️ `c-victim-handling` още носи прекалилия цитат — в премълчано състояние

> „Обръщаш го само ако иначе не можеш да опазиш дихателния път — **повръща или лежи по лице** — и
> тогава цялото тяло се завърта наведнъж, по възможност двама."

Две неща: (а) `rcuk_fa.txt:232` покрива САМО лежащия по лице; за повръщащ по гръб изданията от 2025 г.
не дават изречение — дават принципа (`rcuk_fa.txt:231`: „Airway opening, if required, always has
priority over in-line immobilisation"); (б) **посоката липсва** — „се завърта наведнъж" в абзац, който
две изречения по-рано е забранил страничното положение, се чете най-естествено като „настрани".

Урочният файл `l-accidents-first-aid.json` → `b-victim-handling` вече го е разделил правилно
(„обръщаш ЦЯЛОТО ТЯЛО КАТО ЕДНО ЦЯЛО ПО ГРЪБ… Забележи посоката: по гръб, не настрани"), но **този файл
не се зарежда от никакъв код** (§8.2, т.1). Дефектът е премълчан, не поправен: в мига, в който някой
пинне концепцията, той тръгва към ученика.

Странично: `c-victim-handling.summaryBg` е 932 знака — най-дългото обобщение във файла, при медиана 198.

#### 8.4.6 ✅ ЗАТВОРЕНО · Пиновете бяха регенерирани СЛЕД редакцията — свойството, което те обещават, не е държало

`clearanceCarry.ts` (mtime 23:26:48) е генериран **80 минути след** последния запис в
`content/concepts.json` (mtime 22:06:01). Резултат, проверен чрез хеширане на
`git show HEAD:content/concepts.json`:

- 11 носени концепции са редактирани спрямо HEAD (`c-accident-duties`, `c-e-scooters`,
  `c-elderly-disabled`, `c-general-care-duty`, `c-mandatory-equipment`, `c-parking-prohibitions`,
  `c-railway-crossing`, `c-roundabout-behavior`, `c-roundabout-rules`, `c-scene-safety`,
  `c-when-call-police`);
- **и 11 от 11 имат пин, който съвпада с НОВИЯ текст**, нула с текста от HEAD.

Собственият договор на файла — „обобщение, което е РЕДАКТИРАНО, вече не съвпада с пина си и спира да
се изрича, докато не бъде презамразено" — **не е удържал**, защото таблицата е генерирана от живия файл,
а не от препрочитането на човек. Нищо не е счупено и нищо не е червено. Просто препрочитането, заради
което пинът съществува, не се е случило за тези 11.

> ✅ **Таблицата вече описва един НЕИЗМЕНЯЕМ git blob, а не работното дърво.** `CARRY_FROZEN_BLOB =
> ab63c90a…` е `git rev-parse HEAD:content/concepts.json` — blob, не комит, защото комит може да бъде
> rebase-нат, а пинва се съдържанието. Проверено НЕЗАВИСИМО на 2026-08-05, със собствен скрипт, който
> НЕ импортира нито `clearance.ts`, нито скрипта за замразяване, а пресмята отпечатъка наново от
> алгоритъма и чете таблицата с регулярен израз:
>
> ```
> CARRY_FROZEN_BLOB в кода : ab63c90a777b1d3e0fa32af0d549ae4032b86524
> git rev-parse HEAD:...   : ab63c90a777b1d3e0fa32af0d549ae4032b86524
> пинове                   : 145
> съвпадащи с текста в HEAD: 145        съвпадащи само с живия файл: 0
> редактирани спрямо HEAD  : 11         ПИНОВЕ, УДОСТОВЕРЯВАЩИ РЕДАКТОР: 0
> подписи (CLEARED_SINCE_FREEZE): 0
> ```
>
> Единайсетте редактирани реда носят пин, който все още сочи текста от HEAD, тоест са **премълчани** —
> точно каквото пинът обещава. Нула подписа е честното състояние: никой човек още не е прочел
> новите изречения, и машина няма право да твърди, че е (`MACHINE_SIGNERS`).
>
> **И мотивът беше поправен, не само оръжието.** `clearance.test.ts` твърдеше `stale === []`, тоест
> всяка редакция на съдържание правеше пакета червен и групово препинване беше очевидният път обратно
> към зелено. Проверка, която наказва ПРАВИЛНОТО състояние на покой, обучава всички да я заобикалят.
> Днес застоял пин е нормален и се утвърждава само това, че застоял пин НЕ ГОВОРИ.

*(Правната им половина е проверена дословно при този преглед и е вярна: чл. 139, ал. 2 (т. 3 отм. в
сила от 7.02.2026 г.) и ал. 8, чл. 101, ал. 1, чл. 97, ал. 4 (30 m / 100 m), чл. 116 (изм. ДВ бр. 64
от 2025 г.) и § 6, т. 75 ДР, чл. 98, ал. 1, т. 5 и т. 6, чл. 94, ал. 3 (2,5 т / 2 м), чл. 51, ал. 2–5,
чл. 80а, ал. 1, т. 1 и 3, ал. 2, т. 2, 6 и 12, ал. 3, чл. 125, чл. 123, ал. 1, т. 1 и т. 2, б. „е",
чл. 50, ал. 1, чл. 25, ал. 2, чл. 28, ал. 1, т. 2 — всичките срещу `content/law/acts/zdvp.json`,
консолидиран ДВ бр. 55 от 16.06.2026 г. Две дребни разширения: `c-mandatory-equipment` представя чл.
101, ал. 1 без условието „при повреда", а `c-when-call-police` представя частичен списък по чл. 125
като списъка — липсват т. 7 (разногласие) и т. 8. И двете грешат в безопасната посока.)*

#### 8.4.7 ✅ ЗАТВОРЕНО · Премълчаният урок още се предлага от хъба, и не е свързан звук

`courseClearance()` и `recentWithheldSources()` са експортирани — и **нищо извън модула не ги вика**
(проверено с grep върху цялото `src/`). Затова `l-accidents-first-aid` стои в списъка като нормален
урок, а ученикът, който го отвори, получава: откриващо изречение → **четири последователни еднакви**
реплики „тази част още се проверява" → обобщаващо изречение → нула въпроса. Гейтът е прав; **това не е
свързан учебен час.** Числото, което трябва да реши дали урокът изобщо се предлага, вече съществува —
никой не го чете.

> ✅ **`lessonsInPreparation()` вече има двама повикващи, и то и двата, които могат да отворят урок:**
> хъбът (`classroom/page.tsx`) и прекият адрес (`classroom/[lessonId]/page.tsx`). Значка на индекса,
> покрай която напечатана връзка минава, е украса; „едната врата е проверена, значи и съседната" е
> точно как класната стая изрече обърнатото указание на първо място. Измерено на 2026-08-05 през
> истинския резолвер: **точно един урок е „в подготовка"** — `l-accidents-first-aid`
> (`teach=4 speak=0 withheld=4 quiz=0`). Другите дванайсет урока с поне един премълчан beat запазват
> и говорещи beat-ове, и въпроси, и остават отворени.

### 8.5 Пътят на основателя дотук — две отделни действия, не едно

1. **Подпиши 29-те реда в `/review`.** Това отпушва теста (днес урокът задава 0 въпроса) — но НЕ
   отпушва разказа.
2. **Някой ПРОЧИТА четирите обобщения** и пуска `node scripts/freeze-lesson-carry.mjs --rebuild`, който
   отпечатва всяко изречение, преди да го упълномощи. Преди това: поправи §8.4.5 (посоката на
   обръщането) и §8.4.4 (етикетите „утвърдена практика, не насока"), иначе се пинва дефект.
3. `CARRY_CEILING` е 145 и таблицата е точно 145 реда — четирите не се побират, докато таванът не се
   вдигне в същия комит. Скриптът отказва да го направи мълчаливо, нарочно.

### 8.6 Гейт на този преглед

| Проверка | Резултат |
|---|---|
| `npx tsc --noEmit` | изход **2**, точно **2** грешки, **0** в `modules/lesson`, `modules/tutor`, `lib/content` или `classroom`. И двете са на друга вълна: `sim/orchestrator/__tests__/zz-b29-replay.test.ts(101,104)` TS2339 `severity` и `sim/traffic/__tests__/zz-b29-sightline.test.ts(25,126)` TS2352 `ParkedCar/model`. |
| `npm run validate:content` | **OK** — всички структурни и референтни проверки минават. 152 концепции · 1089 въпроса (799 approved / 290 needs-review) · 77 знака (71 draft / 6 needs-review / **0 approved**). |
| `npx vitest run --maxWorkers=4` | **8 паднали файла / 8 паднали теста** от 728 файла и **11 002 теста** (10 824 минали, 170 пропуснати). |

**Двата очаквани червени, и двата са следствие от 29-те неподписани реда:**
`modules/lesson/__tests__/compose.test.ts` → „gives every lesson at least one quiz beat" (получено
`['l-accidents-first-aid']`) и `modules/exam/__tests__/content-bank.test.ts` → „has no dark, threadbare
or under-represented topic".

**Останалите шест, всеки проследен до файл, всеки на друга вълна:**

- `src/lib/tsconfigHygiene.test.ts` (2 теста) — **точно капанът от `platform/AGENTS.md`**: некомитната
  промяна в `tsconfig.json` е добавила `.next-harness/**` и `.next-rig/**` към `include` (и двете
  съществуват на диска). Пази ги тестът именно за да не инжектират фантомни `tsc` грешки. Не е от този
  преглед — тук не е пипан нито един `.ts`/`.json` файл в `platform/`.
- `src/app/api/review/route.test.ts` (3 теста) — `vi.mock` на `@/modules/content-admin` без `parseQueue`.
  Вече е описано в §7.3 като регресия от вълната за кошниците.
- `src/modules/sim/scene/stop-line-grading.test.ts`, `src/modules/sim/traffic/__tests__/zz-b29-sightline.test.ts`
  и `../tools/mobile/{navigation,ready}.test.mjs` — симулаторната и мобилната вълна.

**Нито един файл в `modules/sim`, `components/sim`, `components/exam`, `components/dashboard`,
`tools/mobile` или `tools/maps` не е докосван от този преглед.** Единствената промяна е този документ.
Четирите харнеса, с които е измерено всичко по-горе, бяха временни тестови файлове в
`src/modules/lesson/__tests__/zz-verify*-scratch.test.ts` и са ИЗТРИТИ; функцията им е трайно покрита от
`clearance.test.ts`, който върви по същите beat-ове.

---

## 9. Преброяване на ВРАТИТЕ — и правилото, което затваря КЛАСА

> **Защо този раздел не е „трите поправки".** Трите врати бяха намерени една по една, всяка беше
> невидима отвътре в съседната си, и всяка беше поправена поотделно. Това е рецепта за четвърти кръг.
> Разделът започва с ПРАВИЛОТО и чак после показва измерванията, защото правилото е онова, което
> основателят трябва да прочете; числата са само доказателството, че то държи — и къде още не държи.
>
> **Всичко тук е измерено чрез ИЗПЪЛНЕНИЕ на 2026-08-05**, върху истинското съдържание и истинския
> резолвер. Забраненият набор е построен от `content/` — концепции без валиден пин, въпроси и знаци
> без `approved` — и **никога от гейта, който се проверява**. Това не е педантичност: гейт, тестван
> срещу набор, който сам е произвел, доказва само че е съгласен със себе си.

### 9.1 ПРАВИЛОТО

Всичките пет намерени досега врати са една и съща грешка, облечена различно:

> **Проверката се закачаше за КОРПУС или за ФУНКЦИЯ. Онова, което трябва да се пази, е ПОВЪРХНОСТ —
> екранът.**

Прочети врата по врата и формата се повтаря без изключение:

| # | Вратата | Кое беше проверено | Кое стигаше до екрана |
|---|---|---|---|
| 1 | `narration.ts` срещу `resolve.ts` | авторският текст (и проверката беше истинска) | съседният композиран път, без нито една проверка |
| 2 | `concepts.json` няма `status` | въпросите и знаците, по `status` | обобщенията — файл, за който нямаше какво да се провери |
| 3 | `tutor/retrieval.ts` | гейтът на модула `lesson` | второ извличане, което не се допитваше до него |
| 3б | `service.ts lessonGrounding` | Tier 1 (`beatMaterials` — гейтнат) | Tier 2, който РАЗШИРЯВАШЕ негейтнато |
| 4 | `micro-quiz-actions.ts` | типът и дължината на идентификатора | обяснението на КОЙТО И ДА Е въпрос — идентификаторът не е вързан за нищо |
| 5 | `learning/session.ts` | класната стая иска `approved` | практиката приема всичко, по документирано решение |
| — | цитатната половина | `lawRefs` на `concepts.json` | същият екран, но от банката и от каталога — непинати |

Оттук следват четири работни правила. Те не са стил; всяко е формулирано от врата, която го е нарушавала.

**П1 — Изброявай ПОВЪРХНОСТИ, не модули.** Въпросът не е „този модул има ли гейт", а „кои низове могат
да стигнат до ученик и какво доказва всеки от тях". Изброяването се прави с `grep` по ПОЛЕТАТА, които
носят твърдение (`summaryBg`, `explanationBg`, `meaningBg`, `lawRefs`), а не по имената на модулите —
§9.2 е точно това упражнение и то намери врата 4 за минути, след като четенето на класната стая не я
беше намерило с месеци.

**П2 — Една функция, не второ мнение.** Второ изпълнение на „това може ли да се изрече" е начинът, по
който съседната врата се пропуска пак: двете се разминават и нищо в дървото не казва коя гледаш.
`retrieval.ts` ВНАСЯ `conceptClearance`/`questionClearance`/`signClearance` от публичния барел на
`@/modules/lesson`, вместо да ги преписва — и точно затова замразяването на цитатите, което влезе в
`clearance.ts` часове по-късно, се наследи безплатно. Преписан гейт нямаше да го наследи.

**П3 — Едно гърло на корпуса.** И свободният чат, и Tier 2 на класната стая минават през ЕДИН
`clearedCandidates()`, тоест има точно един ред за четене, за да се знае какво може да види моделът.
Врата 3б съществуваше именно защото Tier 1 и Tier 2 бяха два отделни пътя до един и същ prompt.

**П4 — Проверката трябва да наказва ГРЕШНОТО състояние, не правилното.** `clearance.test.ts` твърдеше
`stale === []` и с това правеше всяка редакция на съдържание червена; груповото препинване беше
очевидният път обратно към зелено — и точно то се случи с 11 реда. Проверка, която наказва правилното
състояние на покой (премълчано, чака четене), обучава екипа да я заобикаля. Днес застоял пин е
нормалното състояние; утвърждава се само че застоял пин НЕ ГОВОРИ.

**И границата, която П1–П4 не пресичат:** гейт не е замяна. Премълчаният ред се ИЗПУСКА — не се
замества и не се обобщава. Няма с какво честно да се замести: изречение за първа помощ, написано от
нас, за да се запълни дупката, е самото нещо, срещу което гейтът съществува.

### 9.2 Преброяването на вратите — четиринайсет повърхности, всяка изпълнена

Забраненият набор, построен от `content/`: **18 концепции** (11 със застоял пин + 7, които замразяването
никога не е покривало, сред тях четирите първопомощни), **290 въпроса** (`status != approved`), **77
знака** (0 одобрени) → **385 забранени низа**. Кръстосана проверка: гейтът е съгласен с набора, изведен
от `content/`, за **0 разминавания** и по трите корпуса.

| # | Повърхност | Резултат, измерен |
|---|---|---|
| A | Възпроизвеждане в класната стая (`resolveBeat`) | 54 урока · **732 изречения** · **0 забранени** |
| B | Tier 1 — прекъсване (`beatMaterials`) | **2 040 материала** · **0 забранени** |
| C | Tier 2 на класната стая (`retrieveMaterialsInTopic`) | всички уроци × 3 запитвания · 168 материала · **0 забранени** |
| D | Свободен чат (`retrieveMaterials` / `retrieveGrounding`) | **385 враждебни запитвания** — заглавието на всеки забранен ред като въпрос, тоест най-трудният възможен вход · **0 забранени** |
| E | Практика по теория | ⛔ **ОТВОРЕНА** — §9.7.2 |
| F | Микро-тест на симулатора | ⛔ **ОТВОРЕНА** — §9.7.1 |
| G | Панел „Защо" (`clips/whyPanel`) | ⚠️ латентна — 585 идентификатора, 130 `needs-review`, **0 първопомощни**; никой продукционен повикващ не чете полето |
| H | Изпит + преглед след изпит | `builder.ts` е `approved`-only · всичките 29 първопомощни реда са `needs-review` → **0 допустими** |
| I | Класна стая — мини-тест | `quiz.ts:43` е `question.status === "approved"` |
| J | `/api/signs/[code]` | само SVG байтове — без `meaningBg`, без `lawRefs` |
| K | `/api/review` | 404 в продукция + автентикация |
| L | `/api/dev/*` и 19-те `/dev/*` страници | 19 от 19 директории носят пазач `NODE_ENV`/`notFound` |
| M | Авторски разказ (`narration.ts`) | `setLessonNarrationProvider` — **нула** повикващи извън тестове; пътят е инертен |
| N | Каталог на правилата и сценариите | клас `catalogue` — документиран ОСТАТЪК, не гейт (§9.3) |

**Трите въпроса, които течаха — преизмерени дословно:**

```
„Как се мести пострадал в безсъзнание след катастрофа?"  → 0 материала от банката, 0 правила
„Как се спира силно кръвотечение?"                       → 3, и трите approved и извън темата
                                                            (q-predimstvo-067, q-speed-036,
                                                             q-alkohol-i-godnost-035, всеки 1.70)
„Кога се прави сърдечен масаж?"                          → 0 материала от банката, 0 правила
```

Преди гейта първият връщаше шест материала и **всичките шест бяха негейтнати** — `c-victim-handling`
на 10.00 плюс пет `needs-review` реда. Днес: нула. Трите оцелели реда при втория въпрос са остатък от
КАЧЕСТВОТО, не от безопасността: стигат прага на покритие през „спира" + „силно" и не носят нищо
клинично. Убиването им иска рядкост на термина (IDF); вдигането на прага до 0.6 ги маха, но заедно с
тях занемява и „Кога трябва да пропусна пешеходец?", което е по-лоша размяна.

**STOP/ASK по целия първопомощен урок — и той е с ШЕСТ beat-а, не с четири:**

| Beat | tier1 | room | tier2 | статус на всеки ред в Tier 2 |
|---|---|---|---|---|
| `b-open`, `b1..b4-explain`, `b-recap` | **0** | 6 | 6 | `q-ptp-026 · 047 · 005 · 003 · 002 · 007` — **и шестте `approved`** |

Числото 6 не е паднало и това трябва да се каже точно: **паднала е самоличността на всеки ред.** Преди
шестте бяха `needs-review` КЛИНИЧНИ редове (`q-ptp-022`, `-037`, `-056`, `-061`, `-057`, `-013`). Днес
шестте са прочетени, одобрени и **нито един не е клиничен** — те са задълженията при ПТП по ЗДвП
чл. 123 и чл. 124, определението за ПТП и двустранният констативен протокол. Тоест моделът се заземява
в онова, което одобрената част от темата честно може да достави, и отказва всичко клинично. Проверено
поотделно за всичките шест реда, не по извадка.

**Цитатите върху истински излъчени изречения:** 275 носени · **130 различни низа** · **0 с „?"**
(беше 45 от 113).

### 9.3 Двата корпуса, които НИКОЙ пин не покрива — и защо това е находка, а не бележка

`clearanceCitations.ts` пинва `concepts.json`. Само нея. Но на същия екран, в същия ред, стигат цитати
от още два корпуса:

**(а) Банката с въпроси.** `lawRefs` на един въпрос са гейтнати по `status: approved` и **не са
покрити от нито един цитатен пин**. Измерено: цитатите на Tier-1 материалите — тоест точно това, което
отговаря на чипа „Кой член го казва?" — са **301 различни низа, 0 с „?", и 43 назовават член, който
резолверът не намира**. Върху одобрени въпроси това са **156 препратки в 11 акта**, водещи `ППЗДвП`
(67) и `Наредба № РД-02-21-1/23.11.2023` (58). Тоест: една и съща поредица от знаци, на един и същи
екран, се държи по два различни стандарта според това от кой файл е дошла.

**(б) Каталогът на сценариите (`modules/sim/lessons/scenario/templates-*.ts`).** Клас `catalogue` в
`clearance.ts` — честно документиран като ОСТАТЪК. Измерено: **16 от 130-те излъчени цитата не идват
нито от концепциите, нито от банката, нито от знаците.** Сред тях:

```
templates-flow.ts:389
lawRef: "ЗДвП чл. 50, ал. 1; чл. 28, ал. 1, т. 2; Наредба № РД-02-21-1/23.11.2023 чл. 61, ал. 5"
```

Това е **точно** препратката от §8.4.3 — акт, който хранилището не притежава, с номер на член, без
въпросителен знак, на екран на ученик, днес. Предишна вълна претърси каталога за „?", намери нула и го
обяви за чист. Нулата беше вярна; заключението — не. Свойството, което пази един цитат, не е „няма
въпросителен знак", а „резолвира се или няма номер". Каталогът има уверени, номерирани, нерезолвиращи
се цитати — тоест точно състоянието, което §8.4.3 нарича по-лошото от двете, защото се чете като
уредено.

### 9.4 Дупката в самата цитатна проверка — доказана чрез изпълнение, не изведена

Цитатният пин има МАШИННА власт, за разлика от носещия: не твърди „човек е прочел това", а „това
резолвира или няма номер", и скриптът отказва да пинне ред, който не е нито едното. Тази власт е
по-слаба, отколкото изглежда, и границата ѝ е точна:

`normaliseUnitRef` е закотвена в НАЧАЛОТО на низа (`/^(?:чл|Чл|ЧЛ)\.?\s*(\d+)/`). Тоест проверява се
**само първият член**; всичко след него е непроверен текст, който язди присъда, твърдяща, че е проверен.

Доказано, като ИСТИНСКИЯТ скрипт беше пуснат срещу нарочно повредено състояние. `concepts.json` е
възстановена байт по байт след това — sha256 преди и след са идентични и двете замразявания са зелени:

```
# подхвърлено на c-abs-systems:
#   "ЗДвП чл. 20; Наредба № РД-02-21-1/23.11.2023 чл. 61, ал. 5; ЗДвП чл. 9999"
$ node scripts/freeze-lesson-citations.mjs --check
RE-PIN c-abs-systems  613b467b50a0ac02 → 3c6ef73e14629961
  READ THESE AGAINST THE ACT BEFORE YOU COMMIT — a student sees them:
    RESOLVABLE  „ЗДвП чл. 20; Наредба № РД-02-21-1/23.11.2023 чл. 61, ал. 5; ЗДвП чл. 9999"
    ^^^^^^^^^^  съдържа акт, който НЕ притежаваме, И несъществуващ член на ЗДвП

# контрола — същият несъществуващ член, но ПЪРВИ:
$ node scripts/freeze-lesson-citations.mjs --check          #  "ЗДвП чл. 9999"
refusing to freeze — 1 citation(s) are neither resolvable nor numberless:
  c-abs-systems: „ЗДвП чл. 9999" — names an article we cannot resolve — drop the number
```

Днес дупката е **незаета** в `concepts.json`: няма нито една многочленна номерирана препратка (двете
съвпадения са диапазони от групи знаци, без номер на член). Тя обаче е заета в съседния корпус — точно
низът от §9.3(б) минава по същия начин. Записва се тук, защото стандартът на този документ е, че
недоказана дупка е предположение, а изпълнена дупка е находка.

Второ, по-меко ограничение, за да не се приема пинът за повече, отколкото е: `RESOLVABLE` значи
„номерът на члена съществува в акт, който притежаваме", а НЕ „членът казва това". Точно тази разлика
бяха 17-те цитата, сочещи в грешен член, които предишна вълна намери с ЧЕТЕНЕ на 159 члена, не с
изпълнение — `c-turning-right` сочеше члена за левите завои, `c-high-beam-use` и `c-fog-driving` бяха
разменени, `c-medical-fitness` сочеше таблицата с минималните възрасти. Машина хваща `чл. 9999`; човек
хваща `чл. 36` вместо `чл. 35`.

### 9.5 Клиничните твърдения — проверени поотделно, с отрицателно доказателство

Четирите първопомощни обобщения са изцяло пренаписани спрямо HEAD (`c-first-aid-priorities` 204→1442,
`c-cpr-basics` 269→657, `c-bleeding-control` 188→1509, `c-victim-handling` 229→1680 знака) и
**и четирите са ПРЕМЪЛЧАНИ** — `concept-not-carried`, никога пинати. Тоест нищо от долното не стига до
ученик днес; проверката все пак е задължителна, защото всичко стига до него в мига, в който човек ги
подпише.

Всяко клинично изречение е или дословен цитат на назован `файл:ред`, или носи изричен етикет за
декларирана празнота. Преброено: **5 · 0 · 3 · 5** етикета съответно. Нулата при `c-cpr-basics` е
правилна — там няма какво да се етикетира, защото всяка цифра е заземена.

Проверено САМОСТОЯТЕЛНО с `grep` по трите издания (отрицателното доказателство е методът, който хвана
предните три):

```
shake / shaking        = 0 / 0 / 0      ← „не разтърсваш" е НАШ извод и редът го КАЗВА
helmet                 = 0 / 0 / 0      ← каската е НАШ извод и редът го КАЗВА
soaked / impal / embed = 0              ← двете правила от автошколата са етикетирани „практика"
vomit                  = 2 (само rcuk_fa) и нито едно в контекст на обръщане

escalating approach ........ rcuk_fa.txt:113, 237
„not over a joint" · „Write the time" · „Do not release" ..... rcuk_fa.txt:240-245
втори турникет над първия .................................... rcuk_fa.txt:245
„Gently stimulate the person. Ask loudly, «Are you ok?»" ..... erc2025_layperson.txt:752
„responds to pain on squeezing their shoulder" ............... erc2025_layperson.txt:816-817
5–6 cm и 100–120/min ......... erc2025_layperson.txt:446 · rcuk_bls.txt:190-191
пълно изправяне на гърдите ... rcuk_bls.txt:192      трите изхода ... rcuk_fa.txt:141
до 10 секунди ................ erc2025_layperson.txt:791-792
ПТП сред случаите със съмнение за шийна травма ... rcuk_fa.txt:228
обаждане ПРЕДИ оценка на дишането + високоговорител ... rcuk_bls.txt:166-167 · rcuk_fa.txt:110
jaw-thrust ... rcuk_fa.txt:231     обръщане ПО ГРЪБ на лежащ ПО ЛИЦЕ ... rcuk_fa.txt:232
```

Едно от тези числа е урок само по себе си: `grep -c "squeezing their shoulder"` върна **0 и в трите
файла**, макар обобщението да го цитира дословно. Причината е пренасяне на ред —
`erc2025_layperson.txt:816` завършва с „…responds to pain on squeezing their", а `:817` започва с
„shoulder." Нулата беше артефакт на инструмента, не липсващ източник. Затова всяко отрицателно
съвпадение тук е отваряно и гледано, а не преброявано.

**Нови незаземени твърдения, добавени при този преглед: 0.** Този преглед не е пипал никакъв файл със
съдържание — доказано в §9.4 със sha256 преди и след.

### 9.6 Гейт на този преглед

| Проверка | Резултат |
|---|---|
| `npx tsc --noEmit` | **изход 0, НУЛЕВ изход** — пуснат два пъти, в началото и в края. Между двата пуска се появи 6 грешки в `modules/sim/world/__tests__/zzverify3-b34-probe.test.ts` — файл на симулаторната вълна, който тя създаде и ИЗТРИ, докато проверката вървеше. Записва се, за да не мине следващия път за регресия: това е точно капанът от `platform/AGENTS.md`. |
| `npm run validate:content` | **OK** — всички структурни и референтни проверки минават. 152 концепции · 1 089 въпроса (799 approved / 290 needs-review) · 77 знака (71 draft / 6 needs-review / 0 approved). Проверка за изтичане на отговор: 17 обхвата гейтнати, 0 блокиращи. |
| `node scripts/freeze-lesson-carry.mjs --check` | 145 пина, blob `ab63c90a…`, **всичките 145 съвпадат**; 11 премълчани; 0 подписа. |
| `node scripts/freeze-lesson-citations.mjs --check` | 179 резолвиращи · 28 без номер · 6 в очакване на корпус · **актуални: 152 пина**. |
| `npx vitest run --maxWorkers=4` | Пуснат ДВА ПЪТИ, защото дървото се движеше под мен. **Пуск 1:** 7 паднали файла / 7 теста от 730 файла и 11 083 теста. **Пуск 2:** **6 паднали файла / 6 теста** (10 907 минали, 170 пропуснати). |

**Разликата между двата пуска е сама по себе си резултат и се записва, вместо да се избере
по-хубавото число:** `modules/sim/traffic/__tests__/ped-through-parked.test.ts` (B14, шест района) падна
в пуск 1 и мина в пуск 2. Симулаторната вълна пишеше в `content/world/*.json` през цялото време — тези
файлове стоят като променени в `git status` и не са пипани оттук.

**Двата ОЧАКВАНИ червени — и двата са следствие от 29-те неподписани реда:**
`modules/lesson/__tests__/compose.test.ts` → „gives every lesson at least one quiz beat" (получено
`['l-accidents-first-aid']`) и `modules/exam/__tests__/content-bank.test.ts` →
`REVIEW_DEBT: ptp-i-parva-pomosht: only 31/64 (48%) approved`. И двата минават в мига, в който
основателят подпише 29-те реда. Нито `compose.ts`, нито `quiz.ts` чете `summaryBg` или `lawRefs` —
причината е единствено `question.status`.

**Останалите четири, всеки проследен до вълната си:** `app/api/review/route.test.ts` (3 теста — `vi.mock`
на `@/modules/content-admin` без `parseQueue`, вече описано в §7.3), `modules/payments/__tests__/view-barrel-weight.test.ts`
и `../tools/mobile/{navigation,ready}.test.mjs`.

**Приписване, доказано по устройство, а не по твърдение:** този преглед не е променил нито ред код и
нито байт съдържание, затова НИТО ЕДИН паднал тест не може да е негов. `docs/education/92_FIRST_AID_SOURCES.md`
стои като `??` (неследен) в `git status` и е единственият пипнат файл. Трите харнеса, с които е измерено
всичко по-горе, бяха временни тестови файлове
(`src/modules/lesson/__tests__/zzcensus|zzcites|zzdoor4.test.ts`) и са ИЗТРИТИ; `concepts.json` е
възстановена от резервно копие след експеримента в §9.4 и sha256 съвпада байт по байт
(`5cb62240d01773f7…`), проверено повторно след края на работата.

### 9.7 ⛔ КАКВО ОСТАВА ОТВОРЕНО — измерено, не предположено

#### 9.7.1 ✅ ЗАТВОРЕНА на 2026-08-05 — виж §10.2 (повърхности F и F2) за доказателството през истинското сървърно действие. Записът по-долу е какво БЕШЕ.

##### Врата 4 — микро-тестът на симулатора връщаше обяснението на КОЙТО И ДА Е въпрос

`modules/learning/submit.ts` връзва идентификатора за реално раздаден въпрос **само при
`context === "practice"`** (`assertPracticeTicket`). За `context === "micro"` няма нищо:

```
app/(dashboard)/simulator/micro-quiz-actions.ts:136-186
  — проверяват се СЕСИЯ, ПРАВО ЗА СИМУЛАТОР, тип и дължина на идентификатора
  — идентификаторът НЕ се сверява със зададен въпрос
  → submitAnswer(user.id, questionId, …, "micro")
       submit.ts:93   repo.questionById(questionId)      ← без проверка на статус
       submit.ts:158  return { explanationBg, lawRefs }  ← връща се на клиента
```

И раздаващата половина няма филтър по статус: `loadMicroQuizBank` върви по концепции и взима каквото
намери. Измерено при подразбиращите се цели: **74 раздадени реда, 17 от тях неодобрени.** А през
`submit` е достижим кой да е от **1 089-те** реда, включително всичките 29 първопомощни — тоест точно
редовете, които класната стая на съседния екран отказва да изрече.

Поправката е една проверка `questionClearance(question)` в `submitAnswer`, преди обяснението да се
върне. Не е направена тук: `modules/learning` и `app/simulator` са извън обхвата на този преглед.

#### 9.7.2 ⛔ Врата 5 — практиката по теория раздава всичко, по документирано решение

```
modules/learning/session.ts:106  includeUnreviewed = true          ← по подразбиране
modules/learning/session.ts:142  allowedStatuses = {"draft", "approved"}
modules/learning/session.ts:143  + "needs-review"
```

Допустими са И ТРИТЕ статуса, а `theory/practice/actions.ts:115` връща `explanationBg` и `lawRefs`.
Резултатът: **всичките 290 `needs-review` реда** се раздават с обясненията си, включително `q-ptp-013`
и `q-ptp-016` — редове, които класната стая отказва да изрече. И `draft` е допуснат безусловно; днес
това е инертно (0 чернови в банката), но е готово да не бъде.

**Това е РЕШЕНИЕ НА ОСНОВАТЕЛЯ, не поправка в кода.** Изборът е документиран („практиката е мястото, в
което ученикът изследва") и никога не е бил съпоставен с обратното решение на класната стая върху
СЪЩИТЕ редове. Четири корпуса, три политики, едната от тях случайна.

#### 9.7.3 ⚠️→частично ЗАТВОРЕНО на 2026-08-05 · Цитатите на банката и на каталога

> **Какво се промени:** точка 3 (156 препратки върху одобрени въпроси) е **0** — §10.4. Точка 2
> (подпрепратките) върви — 893 проверени, 0 несъответствия. Точка 1 е **частично**: назованият низ в
> `templates-flow.ts` е поправен, но същият акт с пълен член още стига до екрана от четири други
> места, а ППЗДвП — от деветнайсет. §10.5.


Три отделни задачи, подредени по това какво стига до екран днес:

1. **Каталогът на сценариите излъчва `Наредба № РД-02-21-1/23.11.2023 чл. 61, ал. 5`** — акт, който
   нямаме, с номер, без въпросителен знак. Стандартното решение на основателя („актът и предметът
   остават, номерът пада") е приложено в `concepts.json` и не е приложено тук.
2. **`normaliseUnitRef` да покрива ВСЕКИ член в препратката, не само първия** — с това нарочно
   повреденото състояние от §9.4 става червено, вместо `RESOLVABLE`.
3. **Цитатите на банката да минават през същия тест „резолвира се или няма номер"** — 156 препратки
   върху одобрени въпроси днес не минават.

#### 9.7.4 ⚠️ Наблюдаемостта на отказите се самопрепълва

Пръстенът `recentWithheldMaterials()` е с таван 200 и се дедуплицира по (вид, идентификатор). Едно
претърсване на банката отказва 290 въпроса и 77 знака, тоест **367 записа за 200 места**: измерено след
трите въпроса, пръстенът съдържа `{question-not-approved: 123, sign-not-approved: 77}` и **нито един
запис за концепция** — концепциите се обхождат първи и биват изтласкани. Отказите са верни; ВИДИМОСТТА
им не е. Таван по вид, или брояч вместо пръстен, го решава.

#### 9.7.5 ⚠️ Единайсетте премълчани обобщения чакат човек — и това е цената, не пропускът

11 реда са редактирани след замразяването и говорят „под преглед" вместо текста си. Новият им текст
почти сигурно е по-добър от замразения — но това не е въпросът, на който пинът отговаря. Плаща се за
минути: `--check`, после `--show` и `--clear` за всеки. Машина няма право да ги подпише и това е вярно
по устройство (`MACHINE_SIGNERS`), не по учтивост.

Отделно: `content/law/acts/naredba-24.json` е на диска, но не е вписан в `sources.json`, затова
`ACT_IDS` не го зарежда и шестте му препратки към учебната програма (чл. 9, т. 2/4/5/6/8) не
резолвират. Номерата са ПРОЧЕТЕНИ и верни; актът е изброен в `PENDING_CORPUS`, тоест свързването му
ПРЕМАХВА изключението, вместо да го скрие. Иска ред-източник (издател, url, sha256), който не се
измисля.

---

## 10. Четвърти кръг — петте врати, затворени и ПРОВЕРЕНИ; и шестата, която беше точно там, където правилото каза да се търси

> **Какво е новото в този раздел.** §9 описа три врати и остави две отворени (§9.7.1 микро-тестът,
> §9.7.2 практиката). Оттогава две вълни поправиха неща и този раздел не им вярва на думата: **и
> четиринайсетте повърхности са ПУСНАТИ НАНОВО на 2026-08-05**, не само трите пипнати. Забраненият
> набор пак е построен от `content/` и **никога от гейта, който се проверява**.
>
> Резултатът в едно изречение: **врата 4 е затворена и това е доказано през истинското сървърно
> действие; цитатната половина е затворена и числото е 156 → 0; врата 5 (практиката) стои отворена по
> решение на основателя; и има ШЕСТА врата — прегледът СЛЕД изпит.**

### 10.1 Петте врати — как беше намерена всяка, и правилото

Питането „колко врати има" е грешното. Всичките пет са ЕДНА грешка и я казвам с едно изречение:

> **Проверката се закача за КОРПУС или за ФУНКЦИЯ и се прави в ЕДИН МОМЕНТ.
> Онова, което трябва да се пази, е ПОВЪРХНОСТ — екранът — и то във ВСЕКИ момент, в който екранът се
> сглобява.**

| # | Вратата | Как беше НАМЕРЕНА | Кое беше проверено | Кое стигаше до екрана |
|---|---|---|---|---|
| 1 | `resolve.ts` изричаше `summaryBg` без проверка | ИЗПЪЛНЕНИЕ на истинския резолвер върху истинското съдържание — не четене на код. Първопомощният урок изрече обърнатото указание дословно. | `narration.ts:87` проверява `status` — и проверката е истинска | съседният композиран път, който няма нито една проверка |
| 2 | `concepts.json` няма поле `status` | Опит да се напише проверката от врата 1 — нямаше какво да се провери | въпросите и знаците, по `status` | 152 обобщения, за които никой не беше подписвал нищо → пин по sha256 на самото изречение |
| 3 | `tutor/retrieval.ts` заземяваше модела с непроверено | Изброяване на ПОЛЕТАТА (`explanationBg`, `summaryBg`), не на модулите | гейтът на модула `lesson` | второ извличане, което не се допитваше до него; и Tier 2, който РАЗШИРЯВАШЕ негейтнато |
| 4 | микро-тестът в колата — раздаване И подаване | Същото изброяване по полета: „кой друг връща `explanationBg` на клиент" | типът и дължината на идентификатора | обяснението на КОЙ ДА Е от 1 089-те реда, без билет; и раздаването нямаше филтър по статус |
| 5 | `approved` никога не е покривал НОМЕРА до реда | Въпросът „какво точно твърди `approved`" — прочетен буквално | че ЧОВЕК е одобрил ВЪПРОСА | членът, отпечатан до него, на пет екрана извън модула `lesson` |
| **6** | **прегледът СЛЕД изпит** | **Изброяване на всички 35 места, които четат банката ПО ИДЕНТИФИКАТОР** (§10.3) | статусът, при РАЗДАВАНЕТО на изпита | текстът, прочетен наново при ЧЕТЕНЕТО на прегледа |

**Правилото, което прави класа невъзможен** — четири работни правила, всяко формулирано от врата, която
го е нарушавала (П1–П4 стоят в §9.1 и не се повтарят), плюс петото, което врата 6 добавя:

**П5 — Гейтът трябва да стои там, където се чете, а не там, където се раздава.** Раздаването и
показването са два различни момента, а съдържанието се движи между тях: `/review` променя `status`,
`explanationBg`, `options[].correct` и `lawRefs` през цялото време — това му е работата. Проверка при
раздаване не казва нищо за екрана, който се сглобява седмица по-късно от същите идентификатори.
`modules/exam/restore.ts` е насреща: то ЗАПИСВА тази политика („допустимостта се решава ВЕДНЪЖ, при
раздаването") и я мотивира с одит H-7. `modules/exam/review.ts` пази СЪЩИЯ разрив и не го записва —
там разликата не е стилистична, защото замразява ОЦЕНКАТА и чете ТЕКСТА наново (§10.3).

### 10.2 Четиринайсетте повърхности — всяка ПУСНАТА наново на 2026-08-05

**Забраненият набор, изведен от `content/`:** 1 089 въпроса (799 `approved` · 290 `needs-review` · 0
`draft`) → **290 забранени**; 152 концепции → **18 забранени** (11 със застоял пин + 7, които
замразяването никога не е виждало, сред тях всичките четири първопомощни); 77 знака → **77 забранени**
(0 одобрени). Цитатни пинове на въпроси, които не съвпадат: **0 от 1 089**.
**Кръстосана проверка: 0 разминавания** между този набор и онова, което гейтът отказва (18 премълчани
при възпроизвеждане = 11 + 7).

| # | Повърхност | Какво е пуснато | Резултат |
|---|---|---|---|
| A | Възпроизвеждане в класната стая | `resolveBeat` × всички уроци × всички ритми | 54 урока · 510 ритъма · **732 изречения** · **0 забранени**; 18 премълчани `{concept-pin-stale: 11, concept-not-carried: 7}` |
| — | Кои уроци са засегнати | `courseClearance()` | **13 урока** носят премълчан източник; **1 „в подготовка"** — `l-accidents-first-aid` (премълчани 4, говорещи **0**) |
| B | Tier 1 — материалите на ритъма | `beatMaterials` × всички ритми | **2 044 материала** · 271 различни цитата отпечатани · **0 забранени** |
| C | Класна стая Tier 2 (прекъсването) | `authoredAnswer` × 6 намерения × всички ритми + `bestMaterialFor` с първопомощно запитване | **980 авторски отговора** · **0 забранени** |
| D | Свободен чат | `retrieveGrounding` + `retrieveMaterials` × 15 запитвания, натоварени към първата помощ | **116 материала** · **0 забранени**; премълчани 200 `{question-not-approved: 123, sign-not-approved: 77}` |
| E | Практика по теория | `buildPracticeSession` × 16 теми × 3 ученика | ⛔ **ОТВОРЕНА ПО РЕШЕНИЕ** — 472 различни реда `{approved: 358, needs-review: 114}`, **13 неодобрени първопомощни реда раздадени** (q-ptp-009/013/014/015/016/017/018/019/020/021…) |
| F | Микро-тест на симулатора | **истинското сървърно действие** `loadMicroQuizBank` × 10 играещи урока | ✅ **ЗАТВОРЕНА** — **95 различни реда, статуси точно `["approved"]`**; 10/10 банки носят билет (най-дълъг 578 знака); **0 опции с флаг `correct`** |
| F2 | …и подаването | `submitMicroQuizAnswer("q-ptp-009", …)` три пъти | без билет → **ОТКАЗ**; с билет от ДРУГА банка → **ОТКАЗ** (`QUESTION_NOT_IN_SESSION`); с билет, изкован ОКОЛО реда → **ОТКАЗ** (статусната проверка). **`recordAnswer` повиквания: 0** — нито `QuestionAttempt`, нито движение на майсторството |
| G | Панел „Защо" | `resolveWhyPanel` × всичките 1 089 реда | ⚠️ латентна — резолверът връща товар за **1 089 от 1 089**, включително 290 неодобрени; **всеки продукционен повикващ е гейтнат** (практиката — с билет; `lesson/session.ts` — с проверка за принадлежност) |
| H | Изпит | `buildExam` × 25 листа | **543 различни реда** · **0 неодобрени** · 0 несъвпадащи цитатни пина |
| H2 | Преглед СЛЕД изпит | `rehydrateReview` с ред за `q-ptp-009` | ⛔ **ВРАТА 6** — §10.3 |
| I | Тест в класната стая | `dealBeatQuiz` + `gradeBeatAnswer` × всички ритми | **145 тестови ритъма · 184 реда · 0 забранени**; изкован `q-ptp-009` → **отказан на всичките 145** |
| J | `/api/signs/<код>` | истинският `GET` | 200 · `image/svg+xml` · 442 байта · **само графика**: 0 низа със значение в тялото (а и 0 от 77 знака са одобрени) |
| K | `/api/review` | истинските `GET`/`POST` | **404 в продукция, ПРЕДИ да се допита до сесията** · **401 без сесия** · `applyReviewDecision` вика `assertNotProduction()` — три независими гейта |
| L | `/dev/*` и `/api/dev/*` | `src/app/dev/__tests__` | **54 теста минават** — всеки маршрутен файл носи безусловния продукционен гейт |
| M | Доставчик на разказа | `lessonNarration` × три статуса | `draft` → **МЪЛЧИ** · `needs-review` → **МЪЛЧИ** · `approved` → говори |
| N | Каталог на правилата/сценариите | скенер по всички 412 файла в `modules/sim` | §10.5 — **23 цитата с номер върху акт, който нямаме** |
| O | *(извън списъка, но проверено)* `platform/public/**` | 1 755 „игли" (всеки студентски низ на неодобрен ред + всичките 152 обобщения + всичките 77 значения) срещу 625 текстови файла, 71,3 MB | **0 попадения** — нищо от банката не е изпечено в статичен файл, който браузърът тегли без сесия |

### 10.3 ⛔ ВРАТА 6 — прегледът след изпит ЗАМРАЗЯВА ОЦЕНКАТА и ЧЕТЕ ТЕКСТА НАНОВО

Не е изведена, а **изпълнена**:

```
rehydrateReview([{ questionId: "q-ptp-009", optionIds: ["b"], correct: true, points: 2, maxPoints: 2 }])
  → обяснение 542 знака · флагове correct [false,true,false,false]
  → цитати: ЗДвП чл. 123, ал. 1, т. 2 · ЗДвП чл. 175, ал. 1, т. 5
            · НК наказателна отговорност за оставяне на пострадал без помощ
            · НК раздел „Престъпления по транспорта"
  q-ptp-009 е `needs-review`.
```

**Механизмът.** Записът в базата съхранява `correct`, `points` и `maxPoints` — и това е НАРОЧНО: коментарът
в `modules/exam/index.ts` казва „`maxPoints` е тежестта КАКТО Е ОЦЕНЕНА: `getExamReview` не бива да
позволи по-късна редакция на съдържанието да промени какво е можел да изкара кандидатът (одит M-1)".
Значи авторите СА мислили точно за този разрив — и са замразили ЧИСЛОТО, оставяйки ТЕКСТА жив.
`modules/exam/review.ts:rehydrateReview` и `app/(dashboard)/exams/actions.ts:buildReview` (двете
повърхности — трайният преглед на `/exams/[id]` и екранът веднага след предаване) обогатяват всеки ред
с `repo.questionById(id)` **без нито една проверка на статус**, и връщат `textBg`, `options[].textBg`,
`options[].correct`, `explanationBg` и `lawRefs` — прочетени ДНЕС.

**Какво следва от това в реалния работен поток, а не на теория.** `/review` може да направи три неща с
ред, който вече е изпитан (`content-admin/logic.ts:applyDecision`):
* `reject` → `status: "draft"`. Кандидатът пак вижда обяснението на отхвърления ред, като учебен текст.
* `edit` → пач може да смени `options[].correct`, `lawRefs` и `explanationBg`. Тогава страницата показва
  **НОВИЯ ключ до СТАРАТА присъда**: „сгрешил си" стои до опция, която сега е отбелязана като вярна.
* `approve` → безобидно.

**Какъв НЕ е дефектът, за да не се преувеличава.** Не е оракул и не е междупотребителски:
`getExamReview` връща `null`, ако `attempt.userId !== userId`, а `submitExam` оценява по
`pending.questionIds` — идентификаторите, които СЪРВЪРЪТ е раздал — тоест клиент не може да вкара свой
идентификатор в колоната `answers`. Дефектът е **учебна цялост**, не изтичане на ключ. Точно затова
принадлежи на този клас: същата форма като врата 5 — проверката е истинска, но е направена в друг
момент от четенето.

**Защо не е поправена тук.** Трите изхода са продуктово решение, не редакция:
(1) да се замрази текстът в записа — но одит M-1 нарочно ИЗКАРА ~39 KB на опит от съхранението;
(2) да се гейтне прегледът — но тогава кандидат, който е седял листа, губи прегледа си, а прегледът е
най-високоценният учебен момент, който продуктът получава;
(3) да се покаже лента „този ред е върнат за преглед след твоя изпит" — евтино, честно, и не трие нищо.
Изборът е на основателя. `restore.ts` вече е записал своята версия на същия въпрос; `review.ts` няма записана.

**И изброяването, което го намери** (то е по-важно от находката). Формата на класа е: *авторски
български стига до ученик през повикване, което чете банката ПО ИДЕНТИФИКАТОР, а проверката живее
другаде.* Значи пълното изброяване е: всяко такова повикване. Има **35 места в 22 файла**
(`questionById` / `conceptById` / `questionsByConcept` / `signByCode`). Класифицирани:

| Клас | Файлове | Доказателство |
|---|---|---|
| Гейтнати с `clearance` | `lesson/resolve.ts`, `lesson/interrupt.ts` | A, B, C по-горе |
| Гейтнати със статус при раздаване | `lesson/session.ts` (`quiz.ts:43`), `exam/builder.ts:120`, `micro-quiz-actions.ts:158` | F, H, I |
| Гейтнати с БИЛЕТ | `learning/submit.ts`, `theory/practice/actions.ts` | F2 |
| Записана политика: „решава се веднъж" | `exam/restore.ts` | одит H-7, документирано |
| **Без гейт и без записана политика** | **`exam/review.ts`, `exams/actions.ts:buildReview`** | **врата 6** |
| Само числа, никакъв текст | `learning/examFeed.ts`, `learning/readiness.ts`, `gamification/mission.ts`, `lesson/actions.ts:231` | четат `points` / `conceptIds` |
| Само заглавия (навигация) | `simulator/actions.ts`, `theory/practice/page.tsx`, `exam/supply.ts` | `titleBg` / `topicId` |
| Само в изграждането | `lesson/compose.ts` | не е път за изпълнение |
| Продукционно недостъпни | `app/dev/fold-rig/page.tsx` | L |
| Негейтнат резолвер, гейтнати повикващи | `clips/whyPanel.ts` | G — латентно |

**Твърдя, че изброяването е ПЪЛНО за този клас, и ето върху какво стъпва.** Български текст с
твърдение живее на точно четири места: `content/` (банката), `modules/sim` (каталогът),
`content/medical` + `content/sources` (регистрите) и `frames.ts` (сценичните указания на модула).
От `content/` до екран се минава или през барела на репото по идентификатор (35-те места, изброени
горе), или през статичен файл (повърхност O — 0 попадения от 1 755 игли върху 71,3 MB), или през
предварително синтезирано аудио — **няма такова: 0 звукови файла (`mp3/ogg/wav/m4a/opus`) в целия
`platform/public` и `content`, а `tools/theory/synthesize_bg.mjs` пише в `build/tutor-audio`, папка,
която не съществува (`build/` изобщо го няма).**
Каталогът на симулатора е ОБЯВЕН остатък (клас `catalogue` в `clearance.ts`) и е преброен в §10.5.
Регистрите се проверяват от `verify-claims.mjs` (13 твърдения / 54 цитата / **0 провала**).
Ако това изброяване е грешно, то е грешно на едно от тези четири места — не някъде другаде.

### 10.4 Цитатите — 156 → 0, и въпросителните знаци

**Одобрени въпроси, препратки, които резолверът не намира: 156 в 11 акта → `0`.** Измерено с
`ACT_IDS` и `ACT_ALIASES`, прочетени като данни от самия `corpus.ts`, за да няма разминаване:

| Корпус | Препратки | Резолвиращи | Без номер | С номер, но акт, който нямаме |
|---|---|---|---|---|
| Въпроси — само `approved` | 1 186 | 978 | 208 | **0** |
| Въпроси — всички | 1 882 | 1 489 | 376 | 17 (`Наредба № 24`, изрично в `PENDING_CORPUS`) |
| Концепции | 213 | 179 | 28 | 6 (същият акт) |
| Знаци | 97 | 11 | 77 | 9 (0 от 77 знака са сервируеми) |

**Подпрепратките са проверени, не приети.** `resolveLawRef` реже `чл. 21, ал. 3` до `чл. 21`, тоест
измислена алинея резолвираше зелено. Проверката вече върви: **893 подпрепратки, 0 несъответствия.**

**Въпросителни знаци: 0.** По концепции, въпроси, знаци И по `lawRef` в целия `modules/sim`. Нищо от
тази вълна не е върнало нито един. Единствените два `?` в първопомощните файлове са в
`content/lessons/l-accidents-first-aid.json` и са **истинска пунктуация в АНГЛИЙСКИ дословен цитат от
ERC 2025** („Are you ok?", „Pale, cool or clammy skin?") — не маркерът „непроверено" от `SCHEMA.md`.

**ППЗДвП и Наредба № РД-02-21-1 НЕ са внесени** — `content/law/acts/` държи четири файла, `ACT_IDS`
държи три, и двата акта още стоят в `sources.json` като `coverage: "index-only"`, `bytes: null`,
`sha256: null`. Числото падна до 0, защото номерата бяха СВАЛЕНИ, не защото актите бяха отворени.

**Внесен е трети акт — `content/law/acts/naredba-24.json` — и ето го, проверен както се проверява
правният корпус:**

| Проверка | Стойност | Потвърдено? |
|---|---|---|
| URL | `https://lex.bg/laws/ldoc/2135461835` | ✅ в `content/medical/sources.json` |
| Дата на изтегляне | `2026-08-04` | ✅ |
| HTTP | 200 | ✅ записан |
| Сурови байтове / sha256 | 110 826 · `bb0c26827f436ed2…` | ✅ **хеширах `naredba24_lex.html` — съвпада** |
| Текстови байтове / sha256 | 19 373 · `0be8bbaa249fd695…` | ✅ **хеширах `naredba24_lex.txt` — съвпада** |
| Команда за извличане | записана дословно | ✅ |
| Отменената редакция | регистрирана отделно (`src-naredba-24-sars`) с бележка, че ДАБДП сервира стар текст | ✅ — по-строго от собствения формат на правния регистър |
| **Единиците са дословни в проверения текст** | **16 от 17** | ⛔ **виж долу** |

⛔ **`приложение № 2 към чл. 12` съдържа 1 062 знака от МЕБЕЛИРОВКАТА на lex.bg** — новинарски
заглавия от 04.08.2026, форумни теми, рубрика „Хумор". Това е **10,8 % от целия акт**. Извличачът е
глътнал страничната лента, защото приложението е отменено и няма собствено тяло, което да го спре.
Днес не стига до никого (актът не е в `ACT_IDS`), но точно затова се записва: в мига, в който някой
добави `naredba-24` към `ACT_IDS` — а това е очевидната следваща стъпка и `content/medical/README.md:202`
я иска — `getArticle("naredba-24", "приложение № 2")` ще подаде на ученик форума на lex.bg, и
`LawActSchema` няма да мигне, защото това е валиден низ. **`чл. 9` — членът, към който сочат всичките
23 препратки — е чист и верен.**

Другите две неща, които липсват на този внос: **няма ред в `content/law/sources.json`** (`sourceId`
`src-naredba-24-lex` виси от гледна точка на правния регистър) и **`naredba-24` не е в `ACT_IDS`**, тоест
корпусът не го зарежда, не го валидира по `LawActSchema` и не резолвира нито една негова препратка.
Изключението е ЯВНО (`PENDING_CORPUS = new Set(["Наредба № 24"])` в замразяването и в теста), не мълчаливо.

### 10.5 Симулаторният низ — поправеният е поправен, но актът още стига до екрана от четири други места

**Поправеното.** `templates-flow.ts` → `SC_ROUNDABOUT_ENTRY.teach.lawRef` е сега
„ЗДвП чл. 50, ал. 1; чл. 28, ал. 1, т. 2; **Наредба № РД-02-21-1/2023 правила за поставяне на знак Б3**"
— номерът е свален, а предметът е запазен. Това е БАЙТ В БАЙТ същият низ, който банката е замразила за
`c-roundabout-rules` и `c-roundabout-behavior`. И казва СЪЩОТО: `whyBg` на същия шаблон започва
с „Предимството в кръга не идва от отделен член „за кръговите" — такъв в ЗДвП няма. Идва от знака на
входа" — тоест ДЕРИВАЦИЯ, изрично, а не статут. ✅

**Непоправеното — измерено, не предположено.** Скенер по всичките 412 файла на `modules/sim`
(с Кирилски граници, защото `\b` в JavaScript е само ASCII и мълчаливо не задейства до кирилица):
**250 места с `lawRef`; 291 клаузи върху акт, който имаме; 7 без номер върху акт, който нямаме; и 23 С
НОМЕР върху акт, който нямаме.**

* **19 × ППЗДвП** — акт, който изобщо не е в `content/law/acts`. `templates-junctions.ts:408`,
  `templates-lanes.ts:929`, `templates-reels.ts:354`, `templates-signals.ts:128/137/147/465/693/1015`,
  `templates-signals2.ts:195/821`, `rules/catalog.ts:84/381/427/449/594`, и — **четвърти каталог, който
  никой не назовава** — `traffic/controllerGestures.ts:58/67/76`, чийто `lawRef` се РИСУВА върху
  платно в 3D сцената (`TrafficLayer.tsx:760: g.fillText(copy.lawRef, …)`).
* **4 × Наредба № РД-02-21-1/23.11.2023 с пълен член**: `templates-roundabout.ts:480` и `:743`
  (`чл. 61, ал. 5`), `rules/catalog.ts:100` (`чл. 60, ал. 1` — оценяваният ред „Неспиране на знак Б2"),
  `scenarios/event-library.json:911`.
* Отделно, прозата: `templates-flow.ts:371` и `:388` още пишат „(Наредба № РД-02-21-1/23.11.2023,
  чл. 61, ал. 5)" ВЪТРЕ в изречение — четено от повече ученици, отколкото чипът с цитата.

**И гейтът, който още го няма.** `resolveLawRef` / `actIdForActName` / `getArticle` се внасят от **6
файла** и **нито един не е под `modules/sim`**. Единствената проверка върху тези 250 низа е
`lessons/scenario/validate.ts:52`: `LAW_REF_RE = /^(ЗДвП|ППЗДвП|Наредба)/` — проверка на ПЪРВАТА ДУМА.
Банката получи машинно доказван пин; симулаторът получи регулярен израз за префикс.

### 10.6 Гейт на този кръг

| Проверка | Резултат |
|---|---|
| `npx tsc --noEmit` | **изход 0, НУЛЕВ изход** |
| `npm run validate:content` | **OK — всички структурни и референтни проверки минават.** 1 089 въпроса (799 approved / 290 needs-review / 0 draft) · 152 концепции · 77 знака (71 draft / 6 needs-review / 0 approved) · подписани от човек: **0 от 1 089** · изтичане на отговор: 17 обхвата гейтнати, 0 блокиращи |
| `node scripts/freeze-question-citations.mjs --check` | **актуални: 1 089 пина** · 1 489 резолвиращи / 376 без номер / 17 в очакване |
| `node scripts/freeze-lesson-citations.mjs --check` | **актуални: 152 пина** · 179 / 28 / 6 |
| `node scripts/freeze-lesson-carry.mjs --check` | 145 пина, blob `ab63c90a…`, всичките съвпадат; **11 премълчани**; 0 подписа |
| `npx vitest run --maxWorkers=4` | **737 файла · 731 минали · 1 пропуснат · 5 паднали файла / 5 паднали теста от 11 169** (10 994 минали, 170 пропуснати), 282 s |

**Всичките пет червени, всеки проследен до файл и до собственик — нито един не е на този преглед:**

| Файл | Тестове | Причина | Собственик |
|---|---|---|---|
| `modules/exam/__tests__/content-bank.test.ts` | 1 | `REVIEW_DEBT: ptp-i-parva-pomosht: only 31/64 (48%) approved` | **очакван** — 33-те неподписани първопомощни реда; минава в мига на подписа |
| `modules/lesson/__tests__/compose.test.ts` | 1 | `l-accidents-first-aid` няма тестов ритъм | **очакван** — същата причина, `quiz.ts:43` иска `approved` |
| `src/app/api/review/route.test.ts` | 3 | `vi.mock("@/modules/content-admin")` не връща `parseQueue` | вълната за кошниците; вече описано в §7.3. **Гейтовете на маршрута минават** (404 в продукция преди сесията, 401 анонимно, `POST` също) — падат само трите „стига до content-admin" |
| `../tools/mobile/navigation.test.mjs` | 0 (файлово) | `No test suite found` — `node:test` файл, който витест не може да пусне; неследен | мобилната вълна |
| `../tools/mobile/ready.test.mjs` | 0 (файлово) | същото | мобилната вълна |

**Приписване по устройство, не по твърдение.** Този преглед **не е променил нито ред код и нито байт
съдържание**. Всички измервания са направени с временни тестови файлове под `platform/src/zz-*.test.ts`,
които са ИЗТРИТИ; `git status` показва, че единственият пипнат файл е този документ. Три други вълни
пишат в дървото едновременно (`content/world/*.json`, `modules/sim/**`, `content/questions/**`) — техните
файлове стоят като променени и не са докосвани оттук.

✅ **ЗАТВОРЕНО 2026-08-09.** `tools/theory/gen_first_aid_sources.mjs` презаписваше целия файл и
свършваше на §7.3, тоест регенерация изтриваше §8, §9 и §10. Сега слепва: опашката след маркера
`END GENERATED` се запазва байт по байт (проверено — два поредни пуска дават един и същ файл, а
опашката е идентична на изходната), а при ръкописно редактирана глава инструментът отказва и
изброява разликите. Виж §11.

### 10.7 ⛔ Какво остава отворено — с числа

| # | Какво | Състояние | Кой го решава |
|---|---|---|---|
| 1 | **Врата 6** — прегледът след изпит чете текста наново (§10.3) | ⛔ отворена, две повикващи места | продуктово решение: замразяване / гейт / лента |
| 2 | **Практиката раздава всичко** (§9.7.2) | ⛔ отворена ПО РЕШЕНИЕ — измерено: 472 реда, 114 `needs-review`, **13 неодобрени първопомощни** | основателят |
| 3 | **23 цитата в симулатора с номер върху акт, който нямаме** (§10.5) | ⛔ 19 ППЗДвП + 4 наредбата; плюс прозата на `templates-flow.ts:371/388` | вълните, които държат тези файлове |
| 4 | **Нищо в `modules/sim` не резолвира цитат срещу корпуса** | ⛔ `validate.ts:52` е префиксна проверка; приема измислен акт с измислен член | — |
| 5 | **`naredba-24` е на диска, но не е в `sources.json` и не е в `ACT_IDS`** | ⛔ 23 препратки (17 въпросни + 6 концептни) не резолвират; изключението е явно | — |
| 6 | **`приложение № 2` на `naredba-24` носи мебелировка на lex.bg** (§10.4) | ⛔ 1 062 знака, 10,8 % от акта; инертно ДНЕС, отровно в мига на свързването | — |
| 7 | **11 премълчани обобщения чакат човек** (§9.7.5) | ⛔ това е цената, не пропускът; машина няма право да ги подпише (`MACHINE_SIGNERS`) | основателят, минути работа |
| 8 | **Пръстенът на отказите се самопрепълва** (§9.7.4) | ⛔ пак измерено: 200 записа, `{question: 123, sign: 77}`, **0 за концепция** | таван по вид |
| 9 | **Микро-тестът няма ограничител на честотата** | ⚠️ `submitPracticeAnswer` вика `consumeUserRateLimit` пръв; микро няма еквивалент | нов ключ в `RATE_LIMITS` |
| 10 | **Билетът не носи контекст** | ⚠️ практически билет минава през микро и обратно; не дава ключ в никоя посока, но пропуска квотата 20/ден | `c: AnswerContext` + `TICKET_VERSION` |
| 11 | **Остатък при негейтнат билет извън продукция** | ⚠️ ОДОБРЕН, нераздаван ред + без билет + `NODE_ENV != production` → **отговаря и пише 1 запис**. С `PRACTICE_TICKET_REQUIRED=1` (както е в `.env.example`) → **отказ, 0 записа**. Неодобрен ред се отказва ВИНАГИ, независимо от средата | по устройство; записва се, за да не се сметне за нова врата |
| 12 | **137 реда назовават член ВЪТРЕ в студентска проза** (48 одобрени) | ⚠️ никой цитатен пин не вижда вътре в изречение; замразяването го отпечатва при всеки пуск | — |

---

## 11. Пети кръг — ВРАТА 6 е затворена, а симулаторът вече резолвира цитатите си

> **Как е проверено всичко тук.** Чрез ИЗПЪЛНЕНИЕ, върху истинското съдържание и истинските гейтове,
> с временен харнес под `platform/src/zz-*.test.ts`, който е ИЗТРИТ. Забраненият набор пак е построен
> от `content/` и никога от гейта, който се проверява — и този път пробата беше поправена ДВА пъти,
> преди да ѝ се повярва (§11.4).

### 11.1 ⛔→✅ ВРАТА 6 — прегледът след изпит вече не чете текста наново без проверка

Трите изхода, описани в §10.3, се оказаха ФАЛШИВА ТРОЙКА: и двата „скъпи“ (замразяване на текста /
гейт на прегледа) стъпват на предположението, че единственото, което може да се замрази, е
СЪДЪРЖАНИЕТО. Замразява се **отпечатък**.

`modules/exam/pin.ts teachingPin(q)` е sha256-16 точно на онова, от което един преглед преподава:
стъблото, типа, текстовете на опциите, КОИ опции са верни, обяснението и цитатните редове.
`grader.ts` го щампова в момента, в който чете въпроса, за да го оцени; `submitExam` го записва до
`correct`/`points`/`maxPoints` в същата JSON колона; `review.ts` го сравнява при ЧЕТЕНЕ.
**~0,7 KB на изпит от 45 въпроса — 1,8 % от ~39-те KB, които одит M-1 нарочно извади.**

Всеки ред от прегледа вече е в едно от пет състояния (`ReviewIntegrity`), четири от които се казват
на ученика на български, и **нито едно не мести точка**:

| Състояние | Кога | Какво вижда ученикът |
|---|---|---|
| `verified` | отпечатъкът съвпада И `questionClearance` пуска реда | всичко, без бележка |
| `unpinned` | оценен преди отпечатъците да съществуват | ДНЕШНИЯ текст, ЕТИКЕТИРАН като днешен |
| `moved` | редът е редактиран след изпита | присъдата + защо ключът е скрит |
| `withdrawn` | `questionClearance` вече го отказва (отхвърлен → `draft`, или мръднал цитатен пин) | присъдата + „върнат за проверка“ |
| `gone` | вече го няма в банката | както преди |

Двете повърхности вече не са два кода. `rehydrateReview` (трайният преглед) и
`exams/actions.ts buildReview` (екранът веднага след предаване) минават през ЕДИН `buildReviewRow` —
това беше почти-копие, тоест точната форма, в която едното се поправя, а другото остава отворено.
Гейтът не е преписан: `questionClearance` се ВНАСЯ от `@/modules/lesson`, същата функция, на която се
подчиняват класната стая, туторът и микро-тестът (правило П2).

**Измерено върху всичките 1 089 реда на банката, три пъти:**

```
пин актуален   : verified 799 · withdrawn 290   · 0 забранени низа изречени
пин застоял    : moved    799 · withdrawn 290   · 0 реда, които още преподават
без пин        : unpinned 799 · withdrawn 290
```

`modules/exam/__tests__/review-integrity.test.ts` кара всяко от петте състояния поотделно и минава
ВСИЧКИТЕ 290 неодобрени реда един по един, като проверява, че нито един техен студентски низ не
излиза от `buildReviewRow`.

**Какво това НЕ поправя, записано, за да не се смята за затворено.** Ред, оценен ПРЕДИ тази промяна,
няма отпечатък: за него `edit`-ът, който сменя ключа и пре-одобрява, остава незасечим и редът се
показва с бележка „това е днешната версия“. Гейтът по СТАТУС важи и за него. Свойството се
самоизчерпва — всеки нов изпит се записва с отпечатък.

### 11.2 ⛔→✅ 25 цитата в симулатора, и четвъртият каталог, който наистина рисува върху платно

Преброено наново, не наследено. Скенерът (`modules/sim/__tests__/law-citations.test.ts`) пуска
ИСТИНСКИЯ резолвер (`resolveLawRef` върху `content/law/acts/*.json`) върху всеки `lawRef` в модула:

```
преди: 25 отказани клаузи · 16 студентски изречения с номер върху акт, който нямаме
след :  0 ·  0
```

**25, не 23** — §10.5 брои 19 ППЗДвП + 4 наредбата. Скенерът намира и (а)
`lessons/__tests__/engine.test.ts:90`, тестово очакване, което пинваше стария низ, и (б)
`level-complication.test.ts`, чийто НАРОЧНО невалиден `lawRef` вече е именувана константа, за да не
се чете като дефект. Плюс 16 изречения — включително три записани трасета, чиито анотации се ПЕЧАТАТ
в реплея и които затова бяха ПРЕЗАПИСАНИ (`RECORD_TRACES=1`; проверено: `samples` и `meta` са
байт-идентични, сменен е само текстът).

Замяната взима фразата, която банката вече е замразила, БАЙТ В БАЙТ, където такава има:
„ППЗДвП светлинни сигнали за регулиране на движението“ (31 реда), „ППЗДвП надлъжна пътна маркировка“
(10), „Наредба № РД-02-21-1/23.11.2023 правила за поставяне на знак Б3“ (9). За регулировчика банката
няма фраза, затова е нова по същия модел — „ППЗДвП сигнали на регулировчика“ — а половината, която Е
проверима, стои непокътната: **ЗДвП чл. 7**, който е в корпуса и е клаузата, която наистина казва, че
регулировчикът е над лампата.

**И консуматорите се преместиха заедно с низовете.** Ref без номер няма чл./ал./т./§, а
`hazard/feedback.ts parseHazardLawRef` и `tutor/retrieval.ts parseCatalogLawRef` разцепваха цитата на
първия такъв токен — тоест петте каталожни реда щяха да останат без чип и да замлъкнат. Двата бяха
ръчни близнаци (собственият им коментар молеше следващия да ги обедини); сега и двата викат
`parseRuleLawRef` в `modules/sim/rules/lawRef.ts`, което цепи по ИМЕТО НА АКТА. Това поправя и
разцепване, което беше грешно ОТПРЕДИ: „Наредба № РД-02-21-1/23.11.2023 чл. 60, ал. 1“ се цепеше
вътре в означението на самия акт, тоест два реда, цитиращи една наредба, се изписваха като два
различни източника.

`lessons/scenario/validate.ts` запазва префиксната си проверка (тя работи и в браузъра) и вече сочи
към истинската.

### 11.3 ⛔→✅ Мебелировката на lex.bg и генераторът, който триеше собствената си история

**`приложение № 2 към чл. 12` е чисто.** Измерено наново: не 1 062 знака мебелировка, а **980** —
1 062 беше целият текст на единицата, от които 82 са заглавието и „(Отм. …)“. **980 от 9 854 = 9,9 %
от акта.** Извличачът (`content/medical/tools/build-naredba-24.mjs`) има вече два независими стопа
(отменена единица приключва на реда „(Отм. …)“; страничните заглавия на lex.bg завършват документа)
и ОТКАЗ: подписи на уеб страница се търсят в излъчените единици и билдът хвърля, вместо да пише.
`platform/src/lib/content/law/pageFurniture.test.ts` проверява СЪЩОТО свойство върху ВСЕКИ файл в
`content/law/acts/` — четени от ДИРЕКТОРИЯТА, не от корпуса, защото `getLawCorpus()` зарежда точно
трите акта в `ACT_IDS`, тоест точно онези, чието внасяне вече е сметнато за доверено.

**И проверката на проверката хвана деветия инструментален дефект.** Един от подписите беше
`\bмнения\b`. `\b` в JavaScript е само ASCII, значи върху кирилска дума не задейства НИКОГА — подписът
не съвпадаше с нищо и щеше да докладва чисто дърво. Хванат е само защото отрицателният контрол в
теста изброява кои подписи ТРЯБВА да гръмнат ПО ИМЕ, а не колко.

**Генераторът.** `tools/theory/gen_first_aid_sources.mjs` вече слепва: генерира §0–§7.3 и запазва
ръкописната опашка след маркера `END GENERATED` байт по байт (проверено — два поредни пуска дават
идентичен файл, а опашката е идентична на изходната). А пробата показа и второ, неназовавано:
регенерацията МЪЛЧАЛИВО връщаше три ръкописни редакции ВЪТРЕ в генерираната глава, включително
статуса „ЗАТВОРЕНО, ПРОВЕРЕНО ЧРЕЗ ИЗПЪЛНЕНИЕ“ на §7.1 обратно на „⛔ ДНЕС“. Затова инструментът
**отказва да пише**, когато главата на диска се разминава с генерираната, изброява разликите и излиза
с код 1; `--force` регенерира. Опашката оцелява и в двата случая.

### 11.4 Пробата излъга два пъти, преди да ѝ се повярва

Записано, защото това е поуката, а не числата:

1. **Наивното `includes`** върху забранения набор докладва **38 „изтичания“** в прегледа. Всичките са
   ОДОБРЕНИ редове, чиито формулировки съвпадат с неодобрени („Свидетелството за регистрация на
   автомобила.“ е опция и на двете места). Изваждането на всичко, което одобрен ред МОЖЕ да каже,
   свали числото на 6; точното сравнение — на **0**.
2. **`\b` върху кирилица** — §11.3. Същият клас дефект удари и скенера на симулатора: `/^ЗДвП\b/`
   не съвпада с „ЗДвП чл. 25“ и първият пуск обяви 331 клаузи за „не започват с име на акт“.

И третото, от инженерна страна: първата версия слагаше отпечатъка в `review.ts`, което внесе целия
барел на класната стая в графа на `grader.ts` (документиран като „pure functions only“) и изкара два
теста от жизнения цикъл извън 5-секундния им бюджет — само от зареждане. Отпечатъкът живее в
`modules/exam/pin.ts`, лист без зависимости.

### 11.5 ⛔ Какво остава отворено — с числа

| # | Какво | Състояние |
|---|---|---|
| 1 | **Изпити, оценени преди отпечатъците**, не могат да засекат `edit` | ⚠️ показват се с бележка `unpinned`; свойството се самоизчерпва |
| 2 | **74 препратки в банката пишат „прил. № N“** — 40 различни, **100 % върху Наредба № РД-02-21-1**, акт, който нямаме | ⛔ НОВО. `normaliseUnitRef` познава само пълната дума „приложение“, затова абревиатурата чете като „без номер“ и цитатното замразяване я пуска. Това е §10.5 наново, скрито зад съкращение. Скенерът на симулатора вече я отказва; банката е на друга вълна |
| 3 | **Практиката раздава всичко** (§9.7.2) | ⛔ отворена ПО РЕШЕНИЕ на основателя |
| 4 | **`naredba-24` още не е в `sources.json` и не е в `ACT_IDS`** | ⛔ но вече е БЕЗОПАСНО да се свърже — това беше блокерът |
| 5 | **11 премълчани обобщения чакат човек** | ⛔ цената, не пропускът |
| 6 | **137 реда назовават член ВЪТРЕ в студентска проза** | ⚠️ непроменено; никой цитатен пин не вижда вътре в изречение |
