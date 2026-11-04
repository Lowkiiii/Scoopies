import {
  runtimeFunction,
  runtimeValue,
  stateFunction,
  writeRuntimeBinding,
  type LegacyValue,
} from './bindings';

export function actorName(): string {
  const session = runtimeValue<LegacyValue>('session');
  const email = session && session.user ? session.user.email : '';
  return runtimeValue<LegacyValue>('NAMES')[email] ||
    (email ? email.split('@')[0] : 'someone');
}

export function fmtv(value: LegacyValue): LegacyValue {
  return value === '' || value == null ? '(blank)' : value;
}

export function categoryNameIn(state: LegacyValue, id: LegacyValue): string {
  const category = runtimeFunction('getById')(
    state && state.ingredientCategories || [],
    id,
  );
  return category ? category.name : 'Uncategorized';
}

export function diffStates(oldState: LegacyValue, newState: LegacyValue): string[] {
  const output: string[] = [];
  const categories = [
    {
      k: 'ingredientCategories',
      label: 'category',
      f: [['name', 'name']],
    },
    {
      k: 'ingredients',
      label: 'ingredient',
      f: [
        ['name', 'name'],
        ['price', 'total price', '₱'],
        ['purchaseQty', 'quantity bought'],
        ['amountPerItem', 'amount per item'],
        ['batchYield', 'finished batch yield'],
        ['unit', 'unit'],
      ],
    },
    {
      k: 'packaging',
      label: 'packaging',
      f: [
        ['name', 'name'],
        ['price', 'pack price', '₱'],
        ['qty', 'pieces per pack'],
      ],
    },
    {
      k: 'recipes',
      label: 'recipe',
      f: [['name', 'name'], ['yield', 'yield']],
    },
    {
      k: 'products',
      label: 'product',
      f: [
        ['name', 'name'],
        ['targetMargin', 'margin', '', '%'],
        ['price', 'price', '₱'],
      ],
    },
  ];
  categories.forEach(function (category) {
    const oldList = oldState && oldState[category.k] || [];
    const newList = newState && newState[category.k] || [];
    const oldMap: LegacyValue = {};
    const newMap: LegacyValue = {};
    oldList.forEach(function (entry: LegacyValue) { oldMap[entry.id] = entry; });
    newList.forEach(function (entry: LegacyValue) { newMap[entry.id] = entry; });
    newList.forEach(function (entry: LegacyValue) {
      if (!oldMap[entry.id]) {
        output.push(
          'Added ' +
          (category.k === 'ingredients' && entry.kind === 'mixture'
            ? 'mixture'
            : category.label) +
          ' "' + (entry.name || 'untitled') + '"',
        );
      }
    });
    oldList.forEach(function (entry: LegacyValue) {
      if (!newMap[entry.id]) {
        output.push(
          'Deleted ' +
          (category.k === 'ingredients' && entry.kind === 'mixture'
            ? 'mixture'
            : category.label) +
          ' "' + (entry.name || 'untitled') + '"',
        );
      }
    });
    newList.forEach(function (entry: LegacyValue) {
      const previous = oldMap[entry.id];
      if (!previous) return;
      const name = entry.name || previous.name || 'untitled';
      category.f.forEach(function (field) {
        const key = field[0];
        const label = field[1];
        const prefix = field[2] || '';
        const suffix = field[3] || '';
        if (
          runtimeFunction('String')(
            previous[key] == null ? '' : previous[key],
          ) !== runtimeFunction('String')(
            entry[key] == null ? '' : entry[key],
          )
        ) {
          if (key === 'name') {
            output.push(
              'Renamed ' + category.label + ' "' + (previous.name || '') +
              '" → "' + (entry.name || '') + '"',
            );
          } else {
            output.push(
              '"' + name + '" ' + label + ' ' + prefix +
              stateFunction('fmtv')(previous[key]) + suffix + ' → ' + prefix +
              stateFunction('fmtv')(entry[key]) + suffix,
            );
          }
        }
      });
      if (
        category.k === 'ingredients' &&
        runtimeFunction('String')(previous.categoryId || '') !==
          runtimeFunction('String')(entry.categoryId || '')
      ) {
        output.push(
          'Moved "' + name + '" from ' +
          stateFunction('categoryNameIn')(oldState, previous.categoryId) +
          ' to ' + stateFunction('categoryNameIn')(newState, entry.categoryId),
        );
      }
      const JSONValue = runtimeValue<LegacyValue>('JSON');
      if (
        category.k === 'ingredients' &&
        (previous.kind === 'mixture' || entry.kind === 'mixture') &&
        JSONValue.stringify(previous.components || []) !==
          JSONValue.stringify(entry.components || [])
      ) {
        output.push('Updated components in mixture "' + name + '"');
      }
      if (
        category.k === 'recipes' &&
        JSONValue.stringify(previous.lines || []) !==
          JSONValue.stringify(entry.lines || [])
      ) {
        output.push('Updated ingredients in recipe "' + name + '"');
      }
      if (
        category.k === 'products' &&
        JSONValue.stringify(previous.packLines || []) !==
          JSONValue.stringify(entry.packLines || [])
      ) {
        output.push('Updated packaging in product "' + name + '"');
      }
      if (
        category.k === 'products' &&
        runtimeFunction('String')(previous.recipeId || '') !==
          runtimeFunction('String')(entry.recipeId || '')
      ) {
        output.push('Changed recipe for product "' + name + '"');
      }
    });
  });
  return output;
}

export function logChanges(): void {
  const cloud = runtimeValue<LegacyValue>('cloud');
  if (!cloud.client || !runtimeValue('session')) {
    writeRuntimeBinding(
      'lastState',
      stateFunction('snapshot')(runtimeValue('state')),
    );
    return;
  }
  const lastState = runtimeValue('lastState');
  const changes = lastState
    ? stateFunction('diffStates')(lastState, runtimeValue('state'))
    : [];
  writeRuntimeBinding(
    'lastState',
    stateFunction('snapshot')(runtimeValue('state')),
  );
  if (!changes.length) return;
  const actor = stateFunction('actorName')();
  const rows = changes.map(function (summary: string) {
    return { actor, summary };
  });
  cloud.client.from('scoopies_activity').insert(rows).then(
    function () {},
    function () {},
  );
}

export function logCoarse(summary: LegacyValue): void {
  writeRuntimeBinding(
    'lastState',
    stateFunction('snapshot')(runtimeValue('state')),
  );
  const cloud = runtimeValue<LegacyValue>('cloud');
  if (!cloud.client || !runtimeValue('session')) return;
  cloud.client.from('scoopies_activity').insert([{
    actor: stateFunction('actorName')(),
    summary,
  }]).then(function () {}, function () {});
}

export function fmtTime(iso: LegacyValue): string {
  try {
    return new (runtimeValue<LegacyValue>('Date'))(iso).toLocaleTimeString(
      'en-PH',
      { hour: 'numeric', minute: '2-digit' },
    );
  } catch (_error) {
    return '';
  }
}

export function fmtDay(iso: LegacyValue): string {
  try {
    return new (runtimeValue<LegacyValue>('Date'))(iso).toLocaleDateString(
      'en-PH',
      { weekday: 'long', month: 'long', day: 'numeric' },
    );
  } catch (_error) {
    return iso;
  }
}

export function dayKey(iso: LegacyValue): string {
  try {
    return new (runtimeValue<LegacyValue>('Date'))(iso).toDateString();
  } catch (_error) {
    return iso;
  }
}

export async function loadHistory(): Promise<void> {
  const documentValue = runtimeValue<Document>('document');
  const wrap = documentValue.getElementById('historyList');
  if (!wrap) return;
  const cloud = runtimeValue<LegacyValue>('cloud');
  if (!cloud.client || !runtimeValue('session')) {
    wrap.innerHTML =
      '<div class="card"><p class="empty">Sign in to see the history.</p></div>';
    return;
  }
  wrap.innerHTML =
    '<div class="card"><p class="empty">Loading…</p></div>';
  const dateElement = documentValue.getElementById('histDate') as
    | HTMLInputElement
    | null;
  const filterDay = dateElement ? dateElement.value : '';
  try {
    let query = cloud.client.from('scoopies_activity')
      .select('at,actor,summary')
      .order('at', { ascending: false });
    if (filterDay) {
      const DateCtor = runtimeValue<LegacyValue>('Date');
      const start = new DateCtor(filterDay + 'T00:00:00');
      const end = new DateCtor(start.getTime() + 86400000);
      query = query.gte('at', start.toISOString()).lt('at', end.toISOString());
    }
    const result = await query.limit(500);
    if (result.error) throw result.error;
    const rows = result.data || [];
    if (!rows.length) {
      wrap.innerHTML = '<div class="card"><p class="empty">' +
        (filterDay
          ? 'No changes on that date.'
          : 'No changes logged yet. Edit something and it will appear here.') +
        '</p></div>';
      return;
    }
    let html = '';
    let current = '';
    rows.forEach(function (row: LegacyValue) {
      const key = stateFunction('dayKey')(row.at);
      if (key !== current) {
        if (current) html += '</table></div></div>';
        current = key;
        html += '<div class="card"><h2 style="font-size:15px;margin:0 0 6px">' +
          runtimeFunction('escapeHtml')(stateFunction('fmtDay')(row.at)) +
          '</h2><div class="scroll"><table><tr><th>Time</th><th>Name</th><th>Action</th></tr>';
      }
      html += '<tr><td style="white-space:nowrap;color:var(--muted);width:74px">' +
        runtimeFunction('escapeHtml')(stateFunction('fmtTime')(row.at)) +
        '</td><td style="white-space:nowrap;font-weight:600;width:64px;color:var(--brown)">' +
        runtimeFunction('escapeHtml')(row.actor || 'someone') +
        '</td><td>' + runtimeFunction('escapeHtml')(row.summary) + '</td></tr>';
    });
    html += '</table></div></div>';
    wrap.innerHTML = html;
  } catch (error: any) {
    wrap.innerHTML = '<div class="card"><p class="empty">Could not load history: ' +
      runtimeFunction('escapeHtml')(
        error.message || runtimeFunction('String')(error),
      ) + '</p></div>';
  }
}
