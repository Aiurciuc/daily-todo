import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DailyTasksComponent } from './daily-tasks.component';

describe('DailyTasksComponent', () => {
  let fixture: ComponentFixture<DailyTasksComponent>;
  let http: HttpTestingController;
  let element: HTMLElement;
  let day: string;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DailyTasksComponent);
    element = fixture.nativeElement as HTMLElement;
    await TestBed.tick();
    const request = http.expectOne((request) => request.method === 'GET');
    day = request.request.params.get('date') ?? '';
    request.flush([]);
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  async function enterTitle(title: string): Promise<void> {
    const input = element.querySelector<HTMLInputElement>('#title')!;
    input.value = title;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
  }

  function submitForm(): void {
    element
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }

  it('renders the selected day and rejects whitespace-only titles', async () => {
    expect(element.querySelector('time')?.textContent).toBe(day);
    expect(element.textContent).toContain('No tasks for this day.');
    await enterTitle('   ');
    submitForm();
    await fixture.whenStable();
    http.expectNone((request) => request.method === 'POST');
    expect(element.querySelector('#title-errors')?.textContent).toContain('Enter a task title.');
  });

  it('keeps the page and draft mounted while navigating rapidly between days', async () => {
    await enterTitle('My draft');
    const panel = element.querySelector('main');
    const form = element.querySelector('form');
    const input = element.querySelector<HTMLInputElement>('#title')!;
    const next = element.querySelector<HTMLButtonElement>('[aria-label="Next day"]')!;
    const previous = element.querySelector<HTMLButtonElement>('[aria-label="Previous day"]')!;
    next.click();
    await TestBed.tick();
    const pending = http.expectOne((request) => request.method === 'GET');
    expect(previous.disabled).toBe(false);
    expect(input.disabled).toBe(false);
    expect(element.querySelector('main')).toBe(panel);
    expect(element.querySelector('form')).toBe(form);
    expect(input.value).toBe('My draft');
    previous.click();
    await TestBed.tick();
    expect(pending.cancelled).toBe(true);
    const current = http.expectOne((request) => request.method === 'GET');
    expect(current.request.params.get('date')).toBe(day);
    current.flush([]);
    await fixture.whenStable();
    expect(element.querySelector('#title')).toBe(input);
    expect(input.value).toBe('My draft');
  });

  it('adds a trimmed task and resets the form after success', async () => {
    await enterTitle('  Buy milk  ');
    submitForm();
    const request = http.expectOne((request) => request.method === 'POST');
    expect(request.request.body).toEqual({ title: 'Buy milk', date: day });
    request.flush({ id: 1, title: 'Buy milk', date: day, completed: false });
    await fixture.whenStable();
    expect(element.querySelector('li')?.textContent).toContain('Buy milk');
    expect(element.querySelector<HTMLInputElement>('#title')?.value).toBe('');
  });

  it('keeps all controls available while saving and announces success with dismiss', async () => {
    await enterTitle('First');
    submitForm();
    const first = http.expectOne((request) => request.method === 'POST');
    await fixture.whenStable();
    await enterTitle('Second');
    expect(element.querySelector<HTMLInputElement>('#title')!.disabled).toBe(false);
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
    expect(element.querySelector<HTMLButtonElement>('[aria-label="Next day"]')!.disabled).toBe(
      false,
    );
    submitForm();
    await fixture.whenStable();
    first.flush({ id: 1, title: 'First', date: day, completed: false });
    const second = http.expectOne((request) => request.method === 'POST');
    expect(second.request.body.title).toBe('Second');
    await fixture.whenStable();
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Saved: add task.');
    expect(element.querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled).toBe(false);
    element
      .querySelector<HTMLButtonElement>('.drag-handle')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    second.flush({ id: 2, title: 'Second', date: day, completed: false });
    await fixture.whenStable();
    element.querySelector<HTMLButtonElement>('[aria-label="Dismiss notification"]')!.click();
    await fixture.whenStable();
    expect(element.querySelectorAll('.toast')).toHaveLength(1);
  });

  it('keeps the title on save failure so the user can try again', async () => {
    await enterTitle('Keep me');
    submitForm();
    http
      .expectOne((request) => request.method === 'POST')
      .flush({}, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Unable to add task.');
    expect(element.querySelector<HTMLInputElement>('#title')?.value).toBe('Keep me');
  });

  it('loads another day and retries a failed read without displaying an empty-state message', async () => {
    element.querySelector<HTMLButtonElement>('[aria-label="Next day"]')!.click();
    await TestBed.tick();
    const request = http.expectOne((request) => request.method === 'GET');
    expect(request.request.params.get('date')).not.toBe(day);
    request.flush({}, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(element.textContent).toContain('Unable to load tasks.');
    expect(element.textContent).not.toContain('No tasks for this day.');
    element.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    await TestBed.tick();
    http.expectOne((request) => request.method === 'GET').flush([]);
    await fixture.whenStable();
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(element.textContent).toContain('No tasks for this day.');
  });

  it('shows the dropped order while saving and restores it with an error on failure', async () => {
    for (const [id, title] of [
      [1, 'First'],
      [2, 'Second'],
    ] as const) {
      await enterTitle(title);
      submitForm();
      http
        .expectOne((request) => request.method === 'POST')
        .flush({ id, title, date: day, completed: false });
      await fixture.whenStable();
    }
    const moveDown = () =>
      element
        .querySelector<HTMLButtonElement>('.drag-handle')!
        .dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
        );
    const list = element.querySelector('ul');
    const originalRows = Array.from(element.querySelectorAll('li'));
    moveDown();
    const request = http.expectOne('/api/tasks/order');
    expect(request.request.body).toEqual({ date: day, ids: [2, 1] });
    await TestBed.tick();
    expect(element.querySelector('li')?.textContent).toContain('Second');
    expect(element.querySelector('ul')).toBe(list);
    expect(Array.from(element.querySelectorAll('li'))).toEqual([...originalRows].reverse());
    expect(element.textContent).not.toContain('Loading tasks');
    request.flush([
      { id: 2, title: 'Second', date: day, completed: false },
      { id: 1, title: 'First', date: day, completed: false },
    ]);
    await fixture.whenStable();
    expect(element.querySelector('li')?.textContent).toContain('Second');
    moveDown();
    const failed = http.expectOne('/api/tasks/order');
    await TestBed.tick();
    expect(element.querySelector('li')?.textContent).toContain('First');
    expect(element.querySelector('ul')).toBe(list);
    failed.flush({}, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(element.querySelector('li')?.textContent).toContain('Second');
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Unable to reorder tasks.',
    );
    expect(element.querySelector('ul')).toBe(list);
  });

  it('retains persisted completion on failure and cancels a write on destruction', async () => {
    await enterTitle('Task');
    submitForm();
    http
      .expectOne((request) => request.method === 'POST')
      .flush({ id: 1, title: 'Task', date: day, completed: false });
    await fixture.whenStable();
    const checkbox = element.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    checkbox.click();
    const patch = http.expectOne('/api/tasks/1');
    expect(patch.request.body).toEqual({ completed: true });
    expect(checkbox.checked).toBe(false);
    patch.flush({}, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(checkbox.checked).toBe(false);
    expect(element.textContent).toContain('Unable to update task.');
    checkbox.click();
    const pending = http.expectOne('/api/tasks/1');
    fixture.destroy();
    expect(pending.cancelled).toBe(true);
  });
});
