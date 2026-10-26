import { CAMERA_PRESETS } from './config.js';

export class UIManager {
    constructor() {
        this.statusLogEl = document.getElementById('ops-status-log');
        this.rosterListEl = document.getElementById('roster-list');
        this.rosterSummaryEl = document.getElementById('roster-summary');
        this.selCallsignEl = document.getElementById('sel-callsign');
        this.selTypeEl = document.getElementById('sel-type');
        this.selStateEl = document.getElementById('sel-state');
        this.btnUnitAction = document.getElementById('btn-unit-action');
        this.btnUnitFollow = document.getElementById('btn-unit-follow');
        this.btnLaunch = document.getElementById('btn-launch');
        this.btnRecover = document.getElementById('btn-recover');
        this.btnHeli = document.getElementById('btn-heli');
        this.btnToggleRoster = document.getElementById('btn-toggle-roster');
        this.btnToggleHud = document.getElementById('btn-toggle-hud');
        this.hudRoster = document.getElementById('hud-roster');
        this.hudBottom = document.getElementById('hud-bottom');
        this.hudLogPill = document.getElementById('hud-log-pill');

        this.rosterVisible = true;
        this.hudVisible = true;

        this.initToggles();
    }

    setStatusLog(text) {
        if (this.statusLogEl) {
            this.statusLogEl.textContent = text;
        }
    }

    initToggles() {
        if (this.btnToggleRoster && this.hudRoster) {
            this.btnToggleRoster.addEventListener('click', () => {
                this.rosterVisible = !this.rosterVisible;
                this.hudRoster.style.display = this.rosterVisible ? 'flex' : 'none';
                this.btnToggleRoster.classList.toggle('hud-btn-active', this.rosterVisible);
            });
        }

        if (this.btnToggleHud) {
            this.btnToggleHud.addEventListener('click', () => {
                this.hudVisible = !this.hudVisible;
                if (this.hudBottom) this.hudBottom.style.display = this.hudVisible ? 'block' : 'none';
                if (this.hudLogPill) this.hudLogPill.style.display = this.hudVisible ? 'flex' : 'none';
                if (this.hudRoster) this.hudRoster.style.display = (this.hudVisible && this.rosterVisible) ? 'flex' : 'none';
            });
        }
    }

    renderRosterUI(airWingUnits, selectedUnit, followUnit, onSelectUnit) {
        if (!this.rosterListEl) return;
        this.rosterListEl.innerHTML = '';
        let countParked = 0;
        let countAirborne = 0;

        airWingUnits.forEach(u => {
            if (u.state === 'PARKED') countParked++;
            else countAirborne++;

            const item = document.createElement('div');
            const isSelected = u === selectedUnit;
            item.className = `flex items-center justify-between p-2 rounded cursor-pointer transition-all ${
                isSelected
                    ? 'bg-transparent border border-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.35)] ring-1 ring-emerald-400/50'
                    : 'bg-transparent hover:bg-slate-800/20 border border-transparent hover:border-slate-400/35'
            }`;

            let badgeColor = 'text-slate-400';
            if (u.state === 'PARKED') badgeColor = 'text-slate-300';
            else if (u.state === 'AIRBORNE_PATROL' || u.state === 'PATROL_ORBIT') badgeColor = 'text-emerald-300';
            else badgeColor = 'text-sky-300';

            item.innerHTML = `
                <div class="flex items-center gap-2">
                    ${isSelected ? '<span class="w-2.5 h-2.5 rounded-full border border-emerald-300 bg-emerald-400 shadow-[0_0_8px_#34d399]"></span>' : '<span class="w-1.5 h-1.5 rounded-full border border-slate-600 bg-transparent"></span>'}
                    <span class="font-bold ${isSelected ? 'text-emerald-100 font-extrabold text-[12px]' : 'text-white'}">${u.callsign}</span>
                    <span class="text-[9px] px-1.5 py-0.2 rounded border border-slate-400/35 bg-transparent ${isSelected ? 'text-emerald-200 font-bold border-emerald-400/50' : 'text-slate-300'}">${u.type}</span>
                </div>
                <span class="text-[10px] font-bold ${isSelected ? 'text-emerald-200' : badgeColor}">${u.state}</span>
            `;

            item.addEventListener('click', () => {
                if (onSelectUnit) onSelectUnit(u);
            });
            this.rosterListEl.appendChild(item);
        });

        if (this.rosterSummaryEl) {
            this.rosterSummaryEl.textContent = `${airWingUnits.length} UNITS • ${countParked} PARKED • ${countAirborne} AIRBORNE`;
        }

        if (selectedUnit) {
            if (this.btnUnitAction) this.btnUnitAction.disabled = false;
            if (this.btnUnitFollow) this.btnUnitFollow.disabled = false;
            if (this.selCallsignEl) this.selCallsignEl.textContent = selectedUnit.callsign;
            if (this.selTypeEl) this.selTypeEl.textContent = selectedUnit.label;
            if (this.selStateEl) this.selStateEl.textContent = selectedUnit.state;

            if (this.btnUnitFollow) {
                if (followUnit === selectedUnit) {
                    this.btnUnitFollow.textContent = 'FOLLOW: ON';
                    this.btnUnitFollow.classList.add('hud-btn-green-active');
                } else {
                    this.btnUnitFollow.textContent = 'FOLLOW: OFF';
                    this.btnUnitFollow.classList.remove('hud-btn-green-active');
                }
            }

            if (this.btnUnitAction) {
                if (selectedUnit.type === 'MH-60S') {
                    if (selectedUnit.state === 'PARKED') this.btnUnitAction.textContent = 'LIFT OFF';
                    else if (selectedUnit.state === 'PATROL_ORBIT') this.btnUnitAction.textContent = 'LAND & PARK';
                    else this.btnUnitAction.textContent = 'SORTIE ACTIVE';
                } else if (selectedUnit.canCycleJet) {
                    if (selectedUnit.state === 'PARKED') this.btnUnitAction.textContent = 'TAXI & LAUNCH';
                    else if (selectedUnit.state === 'AIRBORNE_PATROL') this.btnUnitAction.textContent = 'RECOVER / LAND';
                    else this.btnUnitAction.textContent = 'OPS IN PROGRESS';
                } else {
                    this.btnUnitAction.textContent = 'AWACS STATION';
                }
            }
        } else {
            if (this.selCallsignEl) this.selCallsignEl.textContent = 'NO TARGET SELECTED';
            if (this.selTypeEl) this.selTypeEl.textContent = 'NONE';
            if (this.selStateEl) this.selStateEl.textContent = 'STANDBY';
            if (this.btnUnitAction) {
                this.btnUnitAction.textContent = 'SELECT AIRCRAFT';
                this.btnUnitAction.disabled = true;
            }
            if (this.btnUnitFollow) {
                this.btnUnitFollow.textContent = 'FOLLOW: OFF';
                this.btnUnitFollow.classList.remove('hud-btn-green-active');
                this.btnUnitFollow.disabled = true;
            }
        }
    }

    bindActions({ onUnitAction, onUnitFollow, onLaunch, onRecover, onHeli, onCameraChange, onTimeChange }) {
        if (this.btnUnitAction && onUnitAction) {
            this.btnUnitAction.addEventListener('click', onUnitAction);
        }
        if (this.btnUnitFollow && onUnitFollow) {
            this.btnUnitFollow.addEventListener('click', onUnitFollow);
        }
        if (this.btnLaunch && onLaunch) {
            this.btnLaunch.addEventListener('click', onLaunch);
        }
        if (this.btnRecover && onRecover) {
            this.btnRecover.addEventListener('click', onRecover);
        }
        if (this.btnHeli && onHeli) {
            this.btnHeli.addEventListener('click', onHeli);
        }

        const camBtns = document.querySelectorAll('.cam-btn');
        camBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                camBtns.forEach(b => b.classList.remove('hud-btn-active'));
                btn.classList.add('hud-btn-active');
                const key = btn.getAttribute('data-cam');
                if (onCameraChange) onCameraChange(key);
            });
        });

        const timeBtns = document.querySelectorAll('.time-btn');
        timeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                timeBtns.forEach(b => b.classList.remove('hud-btn-active'));
                btn.classList.add('hud-btn-active');
                const mode = btn.getAttribute('data-time');
                if (onTimeChange) onTimeChange(mode);
            });
        });
    }
}
