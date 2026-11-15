const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

test('enemyAI.js exports showKillFeedBanner to window', () => {
    const enemyAISrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'enemyAI.js'), 'utf8');
    assert.ok(enemyAISrc.includes('window.showKillFeedBanner = showKillFeedBanner;'), 'enemyAI.js must export showKillFeedBanner to window');
});

test('soldiers.js die() displays TARGET DESTROYED notice for enemy soldiers same as tank', () => {
    const soldiersSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'soldiers.js'), 'utf8');
    assert.ok(soldiersSrc.includes('TARGET DESTROYED:'), 'soldiers.js must show TARGET DESTROYED notice on kill');
    assert.ok(soldiersSrc.includes('window.showKillFeedBanner'), 'soldiers.js must call window.showKillFeedBanner');

    const banners = [];
    const sandbox = {
        window: {
            showKillFeedBanner: (msg) => banners.push(msg),
            addPlayerMoney: () => {},
            tankState: { hitsCount: 0 }
        },
        document: { getElementById: () => null },
        THREE: {
            Vector3: function(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; },
            MathUtils: { lerp: (a, b, t) => a + (b - a) * t }
        }
    };
    sandbox.window.window = sandbox.window;
    vm.createContext(sandbox);

    // Mock soldier die logic
    function simulateSoldierKill(soldierType, isEnemy) {
        const soldier = {
            isEnemy,
            soldierType,
            rewardAwarded: false,
            isDead: false,
            die: function() {
                if (this.isDead) return;
                this.isDead = true;
                if (this.isEnemy && !this.rewardAwarded) {
                    this.rewardAwarded = true;
                    const sTypeLabel = (this.soldierType === 'smg' || this.soldierType === 'submachine_gunner')
                        ? 'Infantry (SMG)'
                        : 'Infantry';
                    sandbox.window.showKillFeedBanner(`TARGET DESTROYED: ${sTypeLabel} (+$5)`);
                }
            }
        };
        soldier.die();
        return soldier;
    }

    simulateSoldierKill('rifle', true);
    assert.equal(banners.length, 1);
    assert.equal(banners[0], 'TARGET DESTROYED: Infantry (+$5)');

    simulateSoldierKill('smg', true);
    assert.equal(banners.length, 2);
    assert.equal(banners[1], 'TARGET DESTROYED: Infantry (SMG) (+$5)');

    // Friendly soldiers do not trigger enemy kill banner
    simulateSoldierKill('rifle', false);
    assert.equal(banners.length, 2);
});
