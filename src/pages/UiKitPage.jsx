import { useState } from "react";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  EducationTrackBadge,
  EmptyState,
  FieldHint,
  HackathonBadge,
  IconBook,
  IconCalendar,
  IconChart,
  IconUsers,
  Input,
  Label,
  PageHeader,
  ProgressBar,
  Select,
  Skeleton,
  Spinner,
  StatCard,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tabs,
  Textarea,
} from "../components/ui";

const demoRows = [
  { id: 1, name: "9 «А»", track: "sosh", attendance: 94 },
  { id: 2, name: "Группа П-21", track: "spo", attendance: 88 },
  { id: 3, name: "11 «Б»", track: "sosh", attendance: 91 },
];

export default function UiKitPage() {
  const [tab, setTab] = useState("sosh");
  const [agree, setAgree] = useState(false);

  return (
    <div className="space-y-10 pb-16">
      <PageHeader
        title="UI-кит EdTech"
        badge={<HackathonBadge />}
        description="Компоненты для решений по оптимизации процессов в СОШ и профессионально-техническом образовании. Только React и Tailwind — без сторонних UI-библиотек."
      />

      <Alert variant="info" title="Как пользоваться">
        Импортируйте компоненты из{" "}
        <code className="rounded bg-white/60 px-1.5 py-0.5 text-xs">../components/ui</code>.
        Цвета и шрифты заданы в{" "}
        <code className="rounded bg-white/60 px-1.5 py-0.5 text-xs">src/index.css</code> через{" "}
        <code className="rounded bg-white/60 px-1.5 py-0.5 text-xs">@theme</code>.
      </Alert>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">Палитра и бейджи</h2>
        <div className="flex flex-wrap gap-2">
          <Badge>Нейтральный</Badge>
          <Badge variant="brand">Цифровизация</Badge>
          <Badge variant="success">Успеваемость</Badge>
          <Badge variant="warning">Требует внимания</Badge>
          <Badge variant="danger">Пропуски</Badge>
          <EducationTrackBadge track="sosh" />
          <EducationTrackBadge track="spo" />
        </div>
        <div className="grid gap-3 sm:grid-cols-5">
          {[
            { token: "brand-500", className: "bg-brand-500" },
            { token: "accent-500", className: "bg-accent-500" },
            { token: "success-600", className: "bg-success-600" },
            { token: "warning-600", className: "bg-warning-600" },
            { token: "danger-600", className: "bg-danger-600" },
          ].map(({ token, className }) => (
            <div key={token} className="overflow-hidden rounded-[var(--radius-ui)] border border-border">
              <div className={`h-12 ${className}`} />
              <p className="px-2 py-1.5 text-xs text-ink-muted">{token}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">Кнопки</h2>
        <div className="flex flex-wrap gap-2">
          <Button>Основное действие</Button>
          <Button variant="secondary">Вторичная</Button>
          <Button variant="outline">Контур</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Удалить</Button>
          <Button size="sm">Малая</Button>
          <Button size="lg">Крупная</Button>
          <Button disabled>Disabled</Button>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">Формы</h2>
        <Card>
          <CardHeader>
            <CardTitle>Заявка на оптимизацию расписания</CardTitle>
            <CardDescription>
              Пример формы для администратора школы или колледжа.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="org" required>
                Учреждение
              </Label>
              <Input id="org" placeholder="МБОУ СОШ №12 / ГПОУ «Политех»" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="track">Уровень</Label>
              <Select id="track" className="mt-1.5" defaultValue="sosh">
                <option value="sosh">Общее среднее (СОШ)</option>
                <option value="spo">Профессионально-техническое (СПО)</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="email">Контакт</Label>
              <Input id="email" type="email" placeholder="admin@school.by" className="mt-1.5" />
              <FieldHint>На этот адрес придёт отчёт по внедрению</FieldHint>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="goal">Задача</Label>
              <Textarea
                id="goal"
                className="mt-1.5"
                placeholder="Сократить время согласования замен, автоматизировать журнал..."
              />
            </div>
            <div className="sm:col-span-2">
              <Checkbox
                id="consent"
                label="Согласен на обработку данных в рамках пилотного проекта"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button disabled={!agree}>Отправить</Button>
            <Button variant="ghost">Черновик</Button>
          </CardFooter>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">Метрики и прогресс</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Учащиеся"
            value="1 248"
            hint="3 учреждения"
            trend="+3.2%"
            icon={<IconUsers className="size-5" />}
          />
          <StatCard
            label="Средняя посещаемость"
            value="92%"
            trend="+1.1%"
            icon={<IconChart className="size-5" />}
          />
          <StatCard
            label="Замены в расписании"
            value="14"
            hint="за неделю"
            trend="-18%"
            icon={<IconCalendar className="size-5" />}
          />
          <StatCard
            label="Электронный журнал"
            value="87%"
            hint="заполненность"
            icon={<IconBook className="size-5" />}
          />
        </div>
        <Card>
          <CardContent className="space-y-4 py-5">
            <ProgressBar label="Внедрение модуля «Расписание»" value={72} />
            <ProgressBar label="Обучение педагогов" value={45} />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">Таблица и вкладки</h2>
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: "sosh", label: "СОШ" },
            { id: "spo", label: "СПО" },
            { id: "all", label: "Все" },
          ]}
        />
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Класс / группа</TableHeaderCell>
              <TableHeaderCell>Уровень</TableHeaderCell>
              <TableHeaderCell>Посещаемость</TableHeaderCell>
              <TableHeaderCell>Ответственный</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {demoRows
              .filter((row) => tab === "all" || row.track === tab)
              .map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>
                    <EducationTrackBadge track={row.track} />
                  </TableCell>
                  <TableCell>{row.attendance}%</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar name="Иван Петров" size="sm" />
                      <span className="text-ink-muted">И. Петров</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">Состояния</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Alert variant="success" title="Синхронизация завершена">
            Данные журнала обновлены для всех классов 5–11.
          </Alert>
          <Alert variant="warning" title="Конфликт в расписании">
            Два урока физики назначены в один кабинет во вторник.
          </Alert>
          <Alert variant="error" title="Ошибка API">
            Не удалось загрузить список групп. Повторите позже.
          </Alert>
          <div className="space-y-3">
            <Spinner />
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          </div>
        </div>
        <EmptyState
          icon={<IconBook className="size-6" />}
          title="Нет данных за четверть"
          description="Подключите электронный журнал или загрузите CSV с успеваемостью."
          actionLabel="Импортировать"
          onAction={() => {}}
        />
      </section>
    </div>
  );
}
