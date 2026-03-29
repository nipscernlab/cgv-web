#include "CaloGeoXML.h"
#include "CaloGeoConst.h"

// definition of pointers to infos gotten in the xml files --------------------

// Calorimeters
float  ***energyp;
float  ***energyn;
float  ***phip;
float  ***phin;
float  ***etap;
float  ***etan;
int    ***pmt1p;
int    ***pmt1n;
int    ***pmt2p;
int    ***pmt2n;
int   ****adc1p;
int   ****adc1n;
int   ****adc2p;
int   ****adc2n;

// Tracks
vector<int>   vnseg;
vector<float> vsegx, vsegy, vsegz;
vector<float> vpt;

void SaxHandler::OnStartElement(const char *name, const TList *attributes)
{
	switch (state)
	{
		case EVENT  : GetEvInfo   (name, attributes); break;
		case BEGIN  : GetDetector (name, attributes); break;
		case ELEMENT: GetParameter(name, attributes); break;
	}
}

void SaxHandler::GetEvInfo(const char *name, const TList *attributes)
{
	if (strcmp(name, "Event") != 0) return;

	TXMLAttr *attr;

	TIter next(attributes);
	while ((attr = (TXMLAttr*) next()))
	{
		     if (strcmp(attr->GetName(),   "runNumber") == 0) ru_num = atoi(attr->GetValue());
		else if (strcmp(attr->GetName(), "eventNumber") == 0) ev_num = atoi(attr->GetValue());
		else if (strcmp(attr->GetName(),    "dateTime") == 0) ev_tim =      attr->GetValue();
	}

	state = BEGIN;
}

void SaxHandler::OnEndElement(const char *name)
{
	if (strcmp(name, "TILE" ) == 0 ||
	    strcmp(name,  "HEC" ) == 0 ||
	    strcmp(name,  "LAr" ) == 0 ||
	    strcmp(name, "MBTS" ) == 0 ||
	    strcmp(name, "Track") == 0   ) {state = BEGIN; return;}

	switch (state)
	{
		// Calorimeters
		case ENERGY     : UpdateEnergy (); break;
		case ID         : UpdateId     (); break;
		case ETA        : UpdateEta    (); break;
		case PHI        : UpdatePhi    (); break;
		case ADC1       : UpdateADC1   (); break;
		case ADC2       : UpdateADC2   (); break;
		case CHANNEL    : UpdateCh     (); break;
		case MODULE     : UpdateMod    (); break;
		case TYPE       : UpdateType   (); break;
		case PMT1       : UpdatePMT1   (); break;
		case PMT2       : UpdatePMT2   (); break;
		// Tracks
		case NSEG       : UpdateNSeg   (); break;
		case TRACKX     : UpdateTrackX (); break;
		case TRACKY     : UpdateTrackY (); break;
		case TRACKZ     : UpdateTrackZ (); break;
		case TRACKPT    : UpdateTrackpt(); break;
		// Trigger
		case TRIGGERDATA: state = BEGIN;   break;
	}

	if (state != BEGIN) state = ELEMENT;

	delete ss; ss = new stringstream; // force clear buffer
}

void SaxHandler::OnCharacters(const char *characters)
{
	switch (state)
	{
		// Calorimeters
		case ENERGY : *ss << characters; break;
		case ID     : *ss << characters; break;
		case ETA    : *ss << characters; break;
		case PHI    : *ss << characters; break;
		case ADC1   : *ss << characters; break;
		case ADC2   : *ss << characters; break;
		case CHANNEL: *ss << characters; break;
		case MODULE : *ss << characters; break;
		case TYPE   : *ss << characters; break;
		case PMT1   : *ss << characters; break;
		case PMT2   : *ss << characters; break;
		// Tracks
		case NSEG   : *ss << characters; break;
		case TRACKX : *ss << characters; break;
		case TRACKY : *ss << characters; break;
		case TRACKZ : *ss << characters; break;
		case TRACKPT: *ss << characters; break;
		// Triggers
		case TRIGGERDATA :
		stringstream tmpStream;
		tmpStream << characters; 
		tmpStream >> _triggerType;
		break;
	}
}

void SaxHandler::GetDetector(const char *name, const TList *attributes)
{
	if(strcmp(name, "ctpItemList") == 0)
	{
		state = TRIGGERDATA;
		return;
	}

	     if (strcmp(name,  "TILE") == 0) subdet =  TILE;
	else if (strcmp(name,   "HEC") == 0) subdet =   HEC;
	else if (strcmp(name,   "LAr") == 0) subdet =   LAR;
	else if (strcmp(name,  "MBTS") == 0) subdet =  MBTS;
	else if (strcmp(name, "Track") == 0) subdet = TRACK;
	else return;

	if (subdet == TRACK) GetNTracks(attributes); else GetNCells(attributes);
	state = ELEMENT;
}

void SaxHandler::GetParameter(const char *name, const TList *attributes)
{
	// Calorimeters
	     if (!strcmp(name,      "energy")) {state = ENERGY; }
	else if (!strcmp(name,          "id")) {state = ID;     }
	else if (!strcmp(name,         "eta")) {state = ETA;    }
	else if (!strcmp(name,         "phi")) {state = PHI;    }
	else if (!strcmp(name,  "adcCounts" )) {state = ADC1; GetNSamples(attributes);}
	else if (!strcmp(name,  "adcCounts1")) {state = ADC1; GetNSamples(attributes);}
	else if (!strcmp(name,  "adcCounts2")) {state = ADC2; GetNSamples(attributes);}
	else if (!strcmp(name,     "channel")) {state = CHANNEL;}
	else if (!strcmp(name,      "module")) {state = MODULE; }
	else if (!strcmp(name,        "type")) {state = TYPE;   }
	else if (!strcmp(name,  "pmt1Number")) {state = PMT1;   }
	else if (!strcmp(name,  "pmt2Number")) {state = PMT2;   }
	// Tracks
	else if (!strcmp(name, "numPolyline")) {state = NSEG;   }
	else if (!strcmp(name,   "polylineX")) {state = TRACKX; }
	else if (!strcmp(name,   "polylineY")) {state = TRACKY; }
	else if (!strcmp(name,   "polylineZ")) {state = TRACKZ; }
	else if (!strcmp(name,          "pt")) {state = TRACKPT;}
}

void SaxHandler::GetNCells(const TList *attributes)
{
	TXMLAttr *attr;

	TIter next(attributes);
	while ((attr = (TXMLAttr*) next()))
	{
		if (strcmp(attr->GetName(), "count")) continue;
		NCells = atoi(attr->GetValue()); return;
	}
}

void SaxHandler::GetNTracks(const TList *attributes)
{
	TXMLAttr *attr;

	TIter next(attributes);
	while ((attr = (TXMLAttr*) next()))
	{
		if (strcmp(attr->GetName(), "count")) continue;
		NTracks = atoi(attr->GetValue()); return;
	}
}

void SaxHandler::GetNSamples(const TList *attributes)
{
	TXMLAttr *attr;

	TIter next(attributes);
	while ((attr = (TXMLAttr*) next()))
	{
		if (strcmp(attr->GetName(), "multiple")) continue;

		switch (subdet)
		{
			case TILE: NSamp_til  = atoi(attr->GetValue()); break;
			case HEC : NSamp_hec  = atoi(attr->GetValue()); break;
			case LAR : NSamp_lar  = atoi(attr->GetValue()); break;
			case MBTS: NSamp_mbts = atoi(attr->GetValue()); break;
		}

		return;
	}
}

void SaxHandler::UpdatePMT1()
{
	if(subdet == TILE)
	{
		has_pmt_number = true;
		int pmt;
		_vpmt1_til.clear();
		for(unsigned i = 0; i < NCells; i++)
		{
			*ss >> pmt;
			_vpmt1_til.push_back(pmt);
		}
	}
}

void SaxHandler::UpdatePMT2()
{
	if(subdet == TILE)
	{
		int pmt;
		_vpmt2_til.clear();
		for(unsigned i = 0; i < NCells; i++)
		{
			*ss >> pmt;
			_vpmt2_til.push_back(pmt);
		}
	}
}

void SaxHandler::UpdateEnergy()
{
	float en;
	unsigned int i;

	switch (subdet)
	{
		case TILE: ven_til.clear();  for (i = 0; i < NCells; i++) {*ss >> en; ven_til.push_back(en);}  break;
		case HEC : ven_hec.clear();  for (i = 0; i < NCells; i++) {*ss >> en; ven_hec.push_back(en);}  break;
		case LAR : ven_lar.clear();  for (i = 0; i < NCells; i++) {*ss >> en; ven_lar.push_back(en);}  break;
		case MBTS: ven_mbts.clear(); for (i = 0; i < NCells; i++) {*ss >> en; ven_mbts.push_back(en);} break;
	}
}

void SaxHandler::UpdateId()
{
	long int id;
	unsigned int i;

	switch (subdet)
	{
		case TILE: vid_til.clear();  for (i = 0; i < NCells; i++) {*ss >> id; vid_til.push_back(id);}  break;
		case HEC : vid_hec.clear();  for (i = 0; i < NCells; i++) {*ss >> id; vid_hec.push_back(id);}  break;
		case LAR : vid_lar.clear();  for (i = 0; i < NCells; i++) {*ss >> id; vid_lar.push_back(id);}  break;
	}
}

void SaxHandler::UpdateEta()
{
	float id;
	unsigned int i;

	switch (subdet)
	{
		case TILE: vet_til .clear(); for (i = 0; i < NCells; i++) {*ss >> id; vet_til.push_back(id);}  break;
		case HEC : vet_hec .clear(); for (i = 0; i < NCells; i++) {*ss >> id; vet_hec.push_back(id);}  break;
		case LAR : vet_lar .clear(); for (i = 0; i < NCells; i++) {*ss >> id; vet_lar.push_back(id);}  break;
		case MBTS: vet_mbts.clear(); for (i = 0; i < NCells; i++) {*ss >> id; vet_mbts.push_back(id);} break;
	}
}

void SaxHandler::UpdatePhi()
{
	float id;
	unsigned int i;

	switch (subdet)
	{
		case TILE: vph_til .clear(); for (i = 0; i < NCells; i++) {*ss >> id; vph_til.push_back(id);} break;
		case HEC : vph_hec .clear(); for (i = 0; i < NCells; i++) {*ss >> id; vph_hec.push_back(id);} break;
		case LAR : vph_lar .clear(); for (i = 0; i < NCells; i++) {*ss >> id; vph_lar.push_back(id);} break;
		case MBTS: vph_mbts.clear(); for (i = 0; i < NCells; i++) {*ss >> id; vph_mbts.push_back(id);} break;
	}
}

void SaxHandler::UpdateADC1()
{
	unsigned int i;
	         int j, val;

	switch (subdet)
	{
		case TILE: for (i = 0; i < va1_til .size(); i++) delete [] va1_til [i]; va1_til .clear(); break;
		case HEC : for (i = 0; i < va1_hec .size(); i++) delete [] va1_hec [i]; va1_hec .clear(); break;
		case LAR : for (i = 0; i < va1_lar .size(); i++) delete [] va1_lar [i]; va1_lar .clear(); break;
		case MBTS: for (i = 0; i < va1_mbts.size(); i++) delete [] va1_mbts[i]; va1_mbts.clear(); break;
	}

	switch (subdet)
	{
		case TILE: for (i = 0; i < NCells; i++) va1_til .push_back(new int[NSamp_til ]); break;
		case HEC : for (i = 0; i < NCells; i++) va1_hec .push_back(new int[NSamp_hec ]); break;
		case LAR : for (i = 0; i < NCells; i++) va1_lar .push_back(new int[NSamp_lar ]); break;
		case MBTS: for (i = 0; i < NCells; i++) va1_mbts.push_back(new int[NSamp_mbts]); break;
	}

	switch (subdet)
	{
		case TILE: for (i = 0; i < NCells; i++) { for (j = 0; j < NSamp_til ; j++) {*ss >> val; va1_til [i][j] = val;} } break;
		case HEC : for (i = 0; i < NCells; i++) { for (j = 0; j < NSamp_hec ; j++) {*ss >> val; va1_hec [i][j] = val;} } break;
		case LAR : for (i = 0; i < NCells; i++) { for (j = 0; j < NSamp_lar ; j++) {*ss >> val; va1_lar [i][j] = val;} } break;
		case MBTS: for (i = 0; i < NCells; i++) { for (j = 0; j < NSamp_mbts; j++) {*ss >> val; va1_mbts[i][j] = val;} } break;
	}
}

void SaxHandler::UpdateADC2()
{
	unsigned int i;
	         int j, val;

	switch (subdet)
	{
		case TILE: for (i = 0; i < va2_til.size(); i++) delete [] va2_til[i]; va2_til.clear(); break;
	}

	switch (subdet)
	{
		case TILE: for (i = 0; i < NCells; i++) va2_til.push_back(new int[NSamp_til]); break;
	}

	switch (subdet)
	{
		case TILE: for (i = 0; i < NCells; i++) { for (j = 0; j < NSamp_til; j++) {*ss >> val; va2_til[i][j] = val;} } break;
	}
}

void SaxHandler::UpdateCh()
{
	unsigned int ch;
	unsigned int i;

	switch (subdet)
	{
		case MBTS : vch_mbts.clear();  for (i = 0; i < NCells; i++) {*ss >> ch; vch_mbts.push_back(ch);} break;
	}
}

void SaxHandler::UpdateMod()
{
	unsigned int mod;
	unsigned int i;

	switch (subdet)
	{
		case MBTS : vmod_mbts.clear();  for (i = 0; i < NCells; i++) {*ss >> mod; vmod_mbts.push_back(mod);} break;
	}
}

void SaxHandler::UpdateType()
{
	int ty;
	unsigned int i;

	switch (subdet)
	{
		case MBTS : vty_mbts.clear();  for (i = 0; i < NCells; i++) {*ss >> ty; vty_mbts.push_back(ty);} break;
	}
}

void SaxHandler::UpdateNSeg()
{
	int n;
	unsigned int i;

	vnseg.clear();
	for (i = 0; i < NTracks; i++) {*ss >> n; vnseg.push_back(n);}
}

void SaxHandler::UpdateTrackX()
{
	unsigned int i, sum = 0;
	float val;

	vsegx.clear();
	for (i = 0; i < NTracks; i++) sum += vnseg[i];
	for (i = 0; i < sum;     i++) {*ss >> val; vsegx.push_back(-val);}
}

void SaxHandler::UpdateTrackY()
{
	unsigned int i, sum = 0;
	float val;

	vsegy.clear();
	for (i = 0; i < NTracks; i++) sum += vnseg[i];
	for (i = 0; i < sum;     i++) {*ss >> val; vsegy.push_back(val);}
}

void SaxHandler::UpdateTrackZ()
{
	unsigned int i, sum = 0;
	float val;

	vsegz.clear();
	for (i = 0; i < NTracks; i++) sum += vnseg[i];
	for (i = 0; i < sum;     i++) {*ss >> val; vsegz.push_back(val);}
}

void SaxHandler::UpdateTrackpt()
{
	unsigned int i;
	float val;

	vpt.clear();
	for (i = 0; i < NTracks; i++) {*ss >> val; vpt.push_back(val);}
}

void SaxHandler::ParseFile(const char *fname)
{
	NSamp_til  = 0;
	NSamp_hec  = 0;
	NSamp_lar  = 0;
	NSamp_mbts = 0;

	vnseg.clear();
	vsegx.clear();
	vsegy.clear();
	vsegz.clear();
	  vpt.clear();

	has_pmt_number = false;

	TSAXParser saxParser;

	saxParser.ConnectToHandler("SaxHandler", this);
	saxParser.ParseFile(fname);

	populate();

	// clean memory ------------------------------------------------------------

	   ven_til.clear();    ven_hec.clear();  ven_lar.clear(); ven_mbts.clear();
	   vet_til.clear();    vet_hec.clear();  vet_lar.clear(); vet_mbts.clear();
	   vph_til.clear();    vph_hec.clear();  vph_lar.clear(); vph_mbts.clear();
	   vid_til.clear();    vid_hec.clear();  vid_lar.clear();
	  vch_mbts.clear();  vmod_mbts.clear(); vty_mbts.clear();
	_vpmt1_til.clear(); _vpmt2_til.clear();

	delete ss;
}

void SaxHandler::SetPMT1Tile(int pmt, int eta, int phi, int lay, int sid)
{
	int*** pmtArray = (sid) ? pmt1p : pmt1n;

	switch (lay)
	{
		case 0:      if (eta < 10) pmtArray[0][eta   ][63-phi] = pmt;
		        else if (eta > 10) pmtArray[3][eta-11][63-phi] = pmt; break;
		case 1:      if (eta <  9) pmtArray[1][eta   ][63-phi] = pmt;
		        else if (eta == 9) pmtArray[7][  0   ][63-phi] = pmt;
		        else if (eta < 15) pmtArray[4][eta-10][63-phi] = pmt; break;
		case 2: eta = eta >> 1;
		             if (eta <  4) pmtArray[2][eta   ][63-phi] = pmt;
		        else if (eta == 4) pmtArray[6][  0   ][63-phi] = pmt;
		        else if (eta <  7) pmtArray[5][eta- 5][63-phi] = pmt; break;
		case 3: eta = eta >> 1;    pmtArray[eta+4][ 0][63-phi] = pmt; break;
	}
}

void SaxHandler::SetPMT2Tile(int pmt, int eta, int phi, int lay, int sid)
{
	int*** pmtArray = (sid) ? pmt2p : pmt2n;

	switch (lay)
	{
		case 0:      if (eta < 10) pmtArray[0][eta   ][63-phi] = pmt;
		        else if (eta > 10) pmtArray[3][eta-11][63-phi] = pmt; break;
		case 1:      if (eta <  9) pmtArray[1][eta   ][63-phi] = pmt;
		        else if (eta == 9) pmtArray[7][  0   ][63-phi] = pmt;
		        else if (eta < 15) pmtArray[4][eta-10][63-phi] = pmt; break;
		case 2: eta = eta >> 1;
		             if (eta <  4) pmtArray[2][eta   ][63-phi] = pmt;
		        else if (eta == 4) pmtArray[6][  0   ][63-phi] = pmt;
		        else if (eta <  7) pmtArray[5][eta- 5][63-phi] = pmt; break;
		case 3: eta = eta >> 1;    pmtArray[eta+4][ 0][63-phi] = pmt; break;
	}
}

void SaxHandler::SetEnergyTile(float en, int eta, int phi, int lay, int sid)
{
	float ***energy;
	if (sid) energy = energyp; else energy = energyn;

	switch (lay)
	{
		case 0:      if (eta < 10) energy[0][eta   ][63-phi] = en;
		        else if (eta > 10) energy[3][eta-11][63-phi] = en; break;
		case 1:      if (eta <  9) energy[1][eta   ][63-phi] = en;
		        else if (eta == 9) energy[7][  0   ][63-phi] = en;
		        else if (eta < 15) energy[4][eta-10][63-phi] = en; break;
		case 2: eta = eta >> 1;
		             if (eta <  4) energy[2][eta   ][63-phi] = en;
		        else if (eta == 4) energy[6][  0   ][63-phi] = en;
		        else if (eta <  7) energy[5][eta- 5][63-phi] = en; break;
		case 3: eta = eta >> 1;    energy[eta+4][ 0][63-phi] = en; break;
		case 4:                    energy[12+eta][0][ 7-phi] = en; break;
	}
}

void SaxHandler::SetEtaTile(float val, int eta, int phi, int lay, int sid)
{
	float ***et;
	if (sid) et = etap; else et = etan;

	switch (lay)
	{
		case 0:      if (eta < 10) et[0][eta   ][63-phi] = val;
		        else if (eta > 10) et[3][eta-11][63-phi] = val; break;
		case 1:      if (eta <  9) et[1][eta   ][63-phi] = val;
		        else if (eta == 9) et[7][  0   ][63-phi] = val;
		        else if (eta < 15) et[4][eta-10][63-phi] = val; break;
		case 2: eta = eta >> 1;
		             if (eta <  4) et[2][eta   ][63-phi] = val;
		        else if (eta == 4) et[6][  0   ][63-phi] = val;
		        else if (eta <  7) et[5][eta- 5][63-phi] = val; break;
		case 3: eta = eta >> 1;    et[eta+4][ 0][63-phi] = val; break;
		case 4:                    et[12+eta][0][ 7-phi] = val; break;
	}
}

void SaxHandler::SetPhiTile(float val, int eta, int phi, int lay, int sid)
{
	float ***ph;
	if (sid) ph = phip; else ph = phin;

	switch (lay)
	{
		case 0:      if (eta < 10) ph[0][eta   ][63-phi] = val;
		        else if (eta > 10) ph[3][eta-11][63-phi] = val; break;
		case 1:      if (eta <  9) ph[1][eta   ][63-phi] = val;
		        else if (eta == 9) ph[7][  0   ][63-phi] = val;
		        else if (eta < 15) ph[4][eta-10][63-phi] = val; break;
		case 2: eta = eta >> 1;
		             if (eta <  4) ph[2][eta   ][63-phi] = val;
		        else if (eta == 4) ph[6][  0   ][63-phi] = val;
		        else if (eta <  7) ph[5][eta- 5][63-phi] = val; break;
		case 3: eta = eta >> 1;    ph[eta+4][ 0][63-phi] = val; break;
		case 4:                    ph[12+eta][0][ 7-phi] = val; break;
	}
}

void SaxHandler::SetADC1Tile(int *val, int eta, int phi, int lay, int sid)
{
	int ****adc1;
	if (sid) adc1 = adc1p; else adc1 = adc1n;

	if (NSamp_til > 0) switch (lay)
	{
		case 0:      if (eta < 10) adc1[0][eta   ][63-phi] = val;
		        else if (eta > 10) adc1[3][eta-11][63-phi] = val; break;
		case 1:      if (eta <  9) adc1[1][eta   ][63-phi] = val;
		        else if (eta == 9) adc1[7][  0   ][63-phi] = val;
		        else if (eta < 15) adc1[4][eta-10][63-phi] = val; break;
		case 2: eta = eta >> 1;
		             if (eta <  4) adc1[2][eta   ][63-phi] = val;
		        else if (eta == 4) adc1[6][  0   ][63-phi] = val;
		        else if (eta <  7) adc1[5][eta- 5][63-phi] = val; break;
		case 3: eta = eta >> 1;    adc1[eta+4][ 0][63-phi] = val; break;
		case 4:                    adc1[12+eta][0][ 7-phi] = val; break;
	}
}

void SaxHandler::SetADC2Tile(int *val, int eta, int phi, int lay, int sid)
{
	int ****adc2;
	if (sid) adc2 = adc2p; else adc2 = adc2n;

	if (NSamp_til > 0) switch (lay)
	{
		case 0:      if (eta < 10) adc2[0][eta   ][63-phi] = val;
		        else if (eta > 10) adc2[3][eta-11][63-phi] = val; break;
		case 1:      if (eta <  9) adc2[1][eta   ][63-phi] = val;
		        else if (eta == 9) adc2[7][  0   ][63-phi] = val;
		        else if (eta < 15) adc2[4][eta-10][63-phi] = val; break;
		case 2: eta = eta >> 1;
		             if (eta <  4) adc2[2][eta   ][63-phi] = val;
		        else if (eta == 4) adc2[6][  0   ][63-phi] = val;
		        else if (eta <  7) adc2[5][eta- 5][63-phi] = val; break;
		case 3: eta = eta >> 1;    adc2[eta+4][ 0][63-phi] = val; break;
	}
}

// This method is a mess, should be replaced!
void SaxHandler::populate()
{
	int eta = 0, phi = 0, lay = 0, sid = 0;
	float ***energy, ***ph, ***et;
	int ****adc1;

	// TileCal -----------------------------------------------------------------

	for (unsigned int i = 0; i < vid_til.size(); i++)
	{
		eta = (vid_til[i] >>  8) & 0x0000000f;
		phi = (vid_til[i] >> 14) & 0x0000003f;
		lay = (vid_til[i] >>  4) & 0x0000000f;
		sid = (vid_til[i] >> 23) & 0x00000001;

		SetEnergyTile(ven_til[i], eta, phi, lay, sid);
		SetEtaTile   (vet_til[i], eta, phi, lay, sid);
		SetPhiTile   (vph_til[i], eta, phi, lay, sid);
		SetADC1Tile  (va1_til[i], eta, phi, lay, sid);
		SetADC2Tile  (va2_til[i], eta, phi, lay, sid);
		if (has_pmt_number)
		{
			SetPMT1Tile(_vpmt1_til[i], eta, phi, lay, sid);
			SetPMT2Tile(_vpmt2_til[i], eta, phi, lay, sid);
		}
	}

	// HEC ---------------------------------------------------------------------

	for (unsigned int i = 0; i < vid_hec.size(); i++)
	{
		eta = (vid_hec[i] >> 18) & 0x0000000f;
		phi = (vid_hec[i] >> 12) & 0x0000003f;
		lay = (vid_hec[i] >> 23) & 0x00000003;
		sid = (vid_hec[i] >> 25) & 0x00000001;

		if (sid) 
		{
			energy = energyp;
			et     = etap;
			ph     = phip;
			adc1   = adc1p;
		}
		else
		{
			energy = energyn;
			et     = etan;
			ph     = phin;
			adc1   = adc1n;
		}

		energy[NLAY_TILE + lay][eta][63-phi] = ven_hec[i];
		    et[NLAY_TILE + lay][eta][63-phi] = vet_hec[i];
		    ph[NLAY_TILE + lay][eta][63-phi] = vph_hec[i];
		if (NSamp_hec > 0)
		  adc1[NLAY_TILE + lay][eta][63-phi] = va1_hec[i];
	}

	// Larg --------------------------------------------------------------------

	int LAR_PART         [8] = {-3, -2, -1, 1, 2, 3, 4, 5};
	int LAR_BARREL_ENDCAP[6] = {-3, -2, -1, 1, 2, 3};

	int larpart;
	int larbarrelendcap;
	int larregion;

	for (unsigned int i = 0; i < vid_lar.size(); i++)
	{

		larpart         = LAR_PART[(vid_lar[i] >> 26) & 7];        // 1: em, 2: hec, 3: fcal
		larbarrelendcap = LAR_BARREL_ENDCAP[vid_lar[i] >> 23 & 7]; // +-1: emb, +-2: emec, +-3: hec

		// regiao esta associado a aglomerado de celulas com mesma eletronica
		switch (larpart)
		{
			case  1: larregion = (vid_lar[i] >> 18) & 7; break;
			case  2: larregion = (vid_lar[i] >> 22) & 1; break;
			default: larregion = -1;
		}

		if (abs(larbarrelendcap) == 1 && larregion == 1) continue; // a regiao 1 do emb nao eh valida (descobrir onde fica isso)

		switch (larpart)
		{
			case 1: eta = (vid_lar[i] >>  9) & 511; break; // eta do em (barril e tampa)
			case 2: eta = (vid_lar[i] >> 18) &  15; break; // eta do hec
			case 3: eta = (vid_lar[i] >> 17) &  63; break; // eta do fcal
		}

		switch (larpart)
		{
			case 1: lay = (vid_lar[i] >> 21) &   3; break; // layer pro em
			case 2:                                        // layer pro hec
			case 3: lay = (vid_lar[i] >> 23) &   3; break; // layer pro fcal
		}

		switch (larpart)
		{
			case 1: phi = (vid_lar[i] >>  1) & 255; break; // phi pro em
			case 2: phi = (vid_lar[i] >> 12) &  63; break; // phi pro hec
			case 3: phi = (vid_lar[i] >> 13) &  15; break; // phi pro fcal
		}

		if (larbarrelendcap > 0) sid = 1; else sid = 0;

		if (sid) 
		{
			energy = energyp;
			et     = etap;
			ph     = phip;
			adc1   = adc1p;
		}
		else
		{
			energy = energyn;
			et     = etan;
			ph     = phin;
			adc1   = adc1n;
		}

		switch (abs(larbarrelendcap))
		{
			// emb
			case 1: energy[NLAY_TILE + NLAY_HEC + lay][eta][phi_size[NLAY_TILE + NLAY_HEC + lay]-1-phi] = ven_lar[i];
			            et[NLAY_TILE + NLAY_HEC + lay][eta][phi_size[NLAY_TILE + NLAY_HEC + lay]-1-phi] = vet_lar[i];
			            ph[NLAY_TILE + NLAY_HEC + lay][eta][phi_size[NLAY_TILE + NLAY_HEC + lay]-1-phi] = vph_lar[i];
			        if (NSamp_lar > 0)
			          adc1[NLAY_TILE + NLAY_HEC + lay][eta][phi_size[NLAY_TILE + NLAY_LAR + lay]-1-phi] = va1_lar[i]; break;
			// emec
			case 2: energy[NLAY_TILE + NLAY_HEC + NLAY_LAR + lay][eta][phi_size[NLAY_TILE + NLAY_HEC + NLAY_LAR + lay]-1-phi] = ven_lar[i];
			            et[NLAY_TILE + NLAY_HEC + NLAY_LAR + lay][eta][phi_size[NLAY_TILE + NLAY_HEC + NLAY_LAR + lay]-1-phi] = vet_lar[i];
			            ph[NLAY_TILE + NLAY_HEC + NLAY_LAR + lay][eta][phi_size[NLAY_TILE + NLAY_HEC + NLAY_LAR + lay]-1-phi] = vph_lar[i];
			        if (NSamp_lar > 0)
			          adc1[NLAY_TILE + NLAY_HEC + NLAY_LAR + lay][eta][phi_size[NLAY_TILE + NLAY_HEC + NLAY_LAR + lay]-1-phi] = va1_lar[i]; break;
		}
	}

	// MBTS  --------------------------------------------------------------------

	for (unsigned int i = 0; i < vch_mbts.size(); i++)
	{
		eta = vch_mbts[i];
		phi = vmod_mbts[i];
		lay = 4;
		sid = (vty_mbts[i]>0) ? 1 : 0;
		SetEnergyTile(ven_mbts[i], eta, phi, lay, sid);
		SetEtaTile   (vet_mbts[i], eta, phi, lay, sid);
		SetPhiTile   (vph_mbts[i], eta, phi, lay, sid);
		if(va1_mbts.size()>0) SetADC1Tile  (va1_mbts[i], eta, phi, lay, sid);
	}
}
