/**
 * Structured resume form: maps JSON Resume to editable fields and builds JSON on demand.
 * Used in the review card so users can edit without touching raw JSON.
 */

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getObj(obj: Record<string, unknown>, key: string): unknown {
  return obj[key];
}

function getStr(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === 'string' ? v : '';
}

function getArr(obj: Record<string, unknown>, key: string): unknown[] {
  const v = obj[key];
  return Array.isArray(v) ? v : [];
}

export interface ResumeFormApi {
  getValue(): Record<string, unknown>;
  validate(): string | null;
}

export function createResumeForm(
  container: HTMLElement,
  initial: Record<string, unknown> | null
): ResumeFormApi {
  const data = initial && typeof initial === 'object' ? initial : {};
  const basics = (getObj(data, 'basics') as Record<string, unknown>) || {};
  const workList = getArr(data, 'work') as Array<Record<string, unknown>>;
  const educationList = getArr(data, 'education') as Array<Record<string, unknown>>;
  const skillsRaw = getObj(data, 'skills');
  let skillsStrings: string[] = [];
  if (Array.isArray(skillsRaw)) {
    skillsStrings = skillsRaw.map((s) => String(typeof s === 'string' ? s : (s as Record<string, unknown>)?.name ?? '').trim()).filter(Boolean);
  } else if (typeof skillsRaw === 'object' && skillsRaw !== null && !Array.isArray(skillsRaw)) {
    const sk = skillsRaw as Record<string, unknown>;
    if (Array.isArray(sk.keywords)) {
      skillsStrings = (sk.keywords as unknown[]).map((k) => String(k)).filter(Boolean);
    }
  }

  const work = workList.length ? workList : [{}];
  const education = educationList.length ? educationList : [{}];

  const root = document.createElement('div');
  root.className = 'resume-form';

  root.innerHTML = `
    <details class="resume-form-card" open>
      <summary class="resume-form-card-header">
        <div>
          <div class="resume-form-card-title">Basics</div>
          <div class="resume-form-card-subtitle">How employers can contact you.</div>
        </div>
      </summary>
      <div class="resume-form-section">
        <label class="resume-form-label">Name</label>
        <input type="text" id="rf-name" class="resume-form-input" value="${escapeHtml(getStr(basics, 'name'))}" placeholder="Full name" />
      </div>
      <div class="resume-form-section">
        <label class="resume-form-label">Email</label>
        <input type="email" id="rf-email" class="resume-form-input" value="${escapeHtml(getStr(basics, 'email'))}" placeholder="email@example.com" />
      </div>
      <div class="resume-form-section">
        <label class="resume-form-label">Phone</label>
        <input type="text" id="rf-phone" class="resume-form-input" value="${escapeHtml(getStr(basics, 'phone'))}" placeholder="Phone" />
      </div>
      <div class="resume-form-section">
        <label class="resume-form-label">Title / Label</label>
        <input type="text" id="rf-label" class="resume-form-input" value="${escapeHtml(getStr(basics, 'label'))}" placeholder="e.g. Software Engineer" />
      </div>
    </details>
    <details class="resume-form-card" open>
      <summary class="resume-form-card-header">
        <div>
          <div class="resume-form-card-title">Summary</div>
          <div class="resume-form-card-subtitle">A short elevator pitch about you.</div>
        </div>
      </summary>
      <div class="resume-form-section">
        <label class="resume-form-label">Summary</label>
        <textarea id="rf-summary" class="resume-form-textarea" rows="3" placeholder="Short professional summary">${escapeHtml(getStr(basics, 'summary'))}</textarea>
      </div>
    </details>
    <details class="resume-form-card" open>
      <summary class="resume-form-card-header">
        <div>
          <div class="resume-form-card-title">Work experience</div>
          <div class="resume-form-card-subtitle">Jobs, internships, and relevant experience.</div>
        </div>
      </summary>
      <div class="resume-form-section">
        <div id="rf-work-list"></div>
        <button type="button" id="rf-add-work" class="review-btn">Add experience</button>
      </div>
    </details>
    <details class="resume-form-card" open>
      <summary class="resume-form-card-header">
        <div>
          <div class="resume-form-card-title">Education</div>
          <div class="resume-form-card-subtitle">Schools, degrees, and programs.</div>
        </div>
      </summary>
      <div class="resume-form-section">
        <div id="rf-education-list"></div>
        <button type="button" id="rf-add-education" class="review-btn">Add education</button>
      </div>
    </details>
    <details class="resume-form-card" open>
      <summary class="resume-form-card-header">
        <div>
          <div class="resume-form-card-title">Skills</div>
          <div class="resume-form-card-subtitle">Technologies and strengths you want to highlight.</div>
        </div>
      </summary>
      <div class="resume-form-section">
        <label class="resume-form-label">Skills (one per line or comma-separated)</label>
        <textarea id="rf-skills" class="resume-form-textarea" rows="3" placeholder="e.g. JavaScript, Node.js">${escapeHtml(skillsStrings.join('\n'))}</textarea>
      </div>
    </details>
  `;
  container.appendChild(root);

  const workListEl = document.getElementById('rf-work-list')!;
  const educationListEl = document.getElementById('rf-education-list')!;

  function renderWorkEntry(index: number, entry: Record<string, unknown>): void {
    const div = document.createElement('div');
    div.className = 'resume-form-entry';
    div.dataset.index = String(index);
    const pos = getStr(entry, 'position') || getStr(entry, 'title');
    const name = getStr(entry, 'name') || getStr(entry, 'company');
    const highlights = getArr(entry, 'highlights') as string[];
    const summary = getStr(entry, 'summary');
    const hlText = highlights.length ? highlights.join('\n') : summary;
    div.innerHTML = `
      <div class="resume-form-row">
        <input type="text" class="rf-work-company" placeholder="Company" value="${escapeHtml(name)}" />
        <input type="text" class="rf-work-position" placeholder="Position" value="${escapeHtml(pos)}" />
        <button type="button" class="rf-remove-work review-btn">Remove</button>
      </div>
      <div class="resume-form-row">
        <input type="text" class="rf-work-start" placeholder="Start (e.g. 2020)" value="${escapeHtml(getStr(entry, 'startDate'))}" />
        <input type="text" class="rf-work-end" placeholder="End (e.g. 2023)" value="${escapeHtml(getStr(entry, 'endDate'))}" />
      </div>
      <textarea class="rf-work-highlights" rows="2" placeholder="Bullet points (one per line)">${escapeHtml(hlText)}</textarea>
    `;
    workListEl.appendChild(div);
    div.querySelector('.rf-remove-work')!.addEventListener('click', () => {
      div.remove();
    });
  }

  function renderEducationEntry(index: number, entry: Record<string, unknown>): void {
    const div = document.createElement('div');
    div.className = 'resume-form-entry';
    div.dataset.index = String(index);
    const institution = getStr(entry, 'institution') || getStr(entry, 'school');
    const area = getStr(entry, 'area') || getStr(entry, 'degree');
    div.innerHTML = `
      <div class="resume-form-row">
        <input type="text" class="rf-edu-institution" placeholder="School" value="${escapeHtml(institution)}" />
        <input type="text" class="rf-edu-area" placeholder="Degree / Area" value="${escapeHtml(area)}" />
        <button type="button" class="rf-remove-edu review-btn">Remove</button>
      </div>
      <div class="resume-form-row">
        <input type="text" class="rf-edu-start" placeholder="Start year" value="${escapeHtml(getStr(entry, 'startDate'))}" />
        <input type="text" class="rf-edu-end" placeholder="End year" value="${escapeHtml(getStr(entry, 'endDate'))}" />
      </div>
    `;
    educationListEl.appendChild(div);
    div.querySelector('.rf-remove-edu')!.addEventListener('click', () => {
      div.remove();
    });
  }

  work.forEach((entry, i) => renderWorkEntry(i, entry as Record<string, unknown>));
  education.forEach((entry, i) => renderEducationEntry(i, entry as Record<string, unknown>));

  document.getElementById('rf-add-work')!.addEventListener('click', () => {
    renderWorkEntry(workListEl.children.length, {});
  });
  document.getElementById('rf-add-education')!.addEventListener('click', () => {
    renderEducationEntry(educationListEl.children.length, {});
  });

  function getValue(): Record<string, unknown> {
    const name = (document.getElementById('rf-name') as HTMLInputElement).value.trim();
    const email = (document.getElementById('rf-email') as HTMLInputElement).value.trim();
    const phone = (document.getElementById('rf-phone') as HTMLInputElement).value.trim();
    const label = (document.getElementById('rf-label') as HTMLInputElement).value.trim();
    const summary = (document.getElementById('rf-summary') as HTMLTextAreaElement).value.trim();

    const basicsOut: Record<string, unknown> = {};
    if (name) basicsOut.name = name;
    if (email) basicsOut.email = email;
    if (phone) basicsOut.phone = phone;
    if (label) basicsOut.label = label;
    if (summary) basicsOut.summary = summary;

    const workOut: Record<string, unknown>[] = [];
    workListEl.querySelectorAll('.resume-form-entry').forEach((entryEl) => {
      const company = (entryEl.querySelector('.rf-work-company') as HTMLInputElement)?.value?.trim();
      const position = (entryEl.querySelector('.rf-work-position') as HTMLInputElement)?.value?.trim();
      const startDate = (entryEl.querySelector('.rf-work-start') as HTMLInputElement)?.value?.trim();
      const endDate = (entryEl.querySelector('.rf-work-end') as HTMLInputElement)?.value?.trim();
      const highlightsText = (entryEl.querySelector('.rf-work-highlights') as HTMLTextAreaElement)?.value?.trim();
      const highlights = highlightsText ? highlightsText.split(/\n/).map((s) => s.trim()).filter(Boolean) : [];
      workOut.push({
        name: company || undefined,
        position: position || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        highlights: highlights.length ? highlights : undefined,
      });
    });

    const educationOut: Record<string, unknown>[] = [];
    educationListEl.querySelectorAll('.resume-form-entry').forEach((entryEl) => {
      const institution = (entryEl.querySelector('.rf-edu-institution') as HTMLInputElement)?.value?.trim();
      const area = (entryEl.querySelector('.rf-edu-area') as HTMLInputElement)?.value?.trim();
      const startDate = (entryEl.querySelector('.rf-edu-start') as HTMLInputElement)?.value?.trim();
      const endDate = (entryEl.querySelector('.rf-edu-end') as HTMLInputElement)?.value?.trim();
      educationOut.push({
        institution: institution || undefined,
        area: area || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
    });

    const skillsText = (document.getElementById('rf-skills') as HTMLTextAreaElement).value.trim();
    const skillsArr = skillsText
      ? skillsText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
      : [];

    const out: Record<string, unknown> = {
      ...data,
      basics: Object.keys(basicsOut).length ? basicsOut : { name: '', email: '' },
      work: workOut,
      education: educationOut,
      skills: skillsArr,
    };
    return out;
  }

  function validate(): string | null {
    const v = getValue();
    const b = (v.basics as Record<string, unknown>) || {};
    const name = String(b.name ?? '').trim();
    const email = String(b.email ?? '').trim();
    if (!name && !email) {
      return 'Name or email is required.';
    }
    return null;
  }

  return { getValue, validate };
}
