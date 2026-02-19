# QuadScalp — Guide d'installation pour le client

## Étape 1: Compte Interactive Brokers

1. Aller sur https://www.interactivebrokers.com/en/trading/open-account.php
2. Choisir **Individual Account**
3. Remplir les infos (identité, adresse, emploi)
4. **Minimum $0** pour ouvrir (pas de dépôt requis pour paper trading)
5. Attendre l'approbation (24-48h)

### Type de compte recommandé:
- **Paper Trading** d'abord (argent fictif, zéro risque)
- **Margin Account** quand prêt pour le live (pour les futures)

---

## Étape 2: IB Gateway

### Téléchargement:
1. Aller sur https://www.interactivebrokers.com/en/trading/ibgateway-stable.php
2. Télécharger **IB Gateway** pour Linux
3. Installer:
```bash
chmod +x ibgateway-stable-standalone-linux-x64.sh
./ibgateway-stable-standalone-linux-x64.sh
```

### Configuration:
1. Lancer IB Gateway
2. Se connecter avec les identifiants IB
3. **API Settings** (icône engrenage):
   - ✅ Enable ActiveX and Socket Clients
   - Socket port: **4002** (paper) ou **4001** (live)
   - ✅ Allow connections from localhost only
   - ❌ Read-Only API (décocher pour pouvoir placer des ordres)

### Ports:
| Port | Mode | Description |
|------|------|-------------|
| 4002 | Paper | Argent fictif, safe pour tester |
| 4001 | Live | Argent réel, attention! |

---

## Étape 3: Abonnement données CME

1. Se connecter sur https://www.interactivebrokers.com
2. Aller dans **Account → Settings → Market Data Subscriptions**
3. Souscrire à:

| Données | Prix/mois | Pourquoi |
|---------|-----------|----------|
| CME Real-Time (Non-Pro) | ~$15 | ES, NQ futures |
| NYMEX Real-Time (Non-Pro) | ~$15 | CL (pétrole) |

**Note**: En Paper Trading, les données sont gratuites mais avec 15 min de délai. L'abonnement donne les prix en temps réel.

---

## Lancer QuadScalp en mode LIVE

### 1. Démarrer IB Gateway
```bash
~/Jts/ibgateway/*/ibgateway
```
Se connecter avec ses identifiants IB.

### 2. Configurer QuadScalp
Éditer `/home/serinityvault/Desktop/quadscalp/backend/.env`:
```
DEMO_MODE=false
IB_PORT=4002    # Paper trading (safe)
# IB_PORT=4001  # Live trading (argent réel!)
```

### 3. Lancer QuadScalp
```bash
cd ~/Desktop/quadscalp
./start.sh
```

### 4. Ouvrir le navigateur
http://localhost:5173

Le badge passera de **DEMO** à **LIVE** automatiquement.

---

## Coûts mensuels

| Item | Coût |
|------|------|
| Compte IB | $0 |
| IB Gateway | $0 (gratuit) |
| Données CME | ~$15/mois |
| Données NYMEX (optionnel) | ~$15/mois |
| Commissions ES | ~$2.25/contrat aller-retour |
| **Total minimum** | **~$15/mois + commissions** |

---

## Checklist avant de trader en LIVE

- [ ] Compte IB approuvé et financé
- [ ] IB Gateway installé et configuré
- [ ] Abonnement données CME actif
- [ ] Testé en Paper Trading pendant minimum 1 semaine
- [ ] Compris les risques du trading de futures
- [ ] Stop loss et risk management configurés
