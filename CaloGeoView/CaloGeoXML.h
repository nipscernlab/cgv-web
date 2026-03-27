#ifndef CALOGEOXML_H
#define CALOGEOXML_H

#include "Riostream.h"
#include "TList.h"
#include "TSAXParser.h"
#include "TXMLAttr.h"

#include <sstream>
#include <string>
#include <vector>

// states
enum States{
	EVENT = 0,
	BEGIN,
	ELEMENT,
	TRIGGER
};

// retrieved elements
enum ELEMENTS{
	ENERGY = 50,
	ID,
	ETA,
	PHI,
	ADC1,
	ADC2,
	TRIGGERDATA,
	CHANNEL,  // only for MBTS
	MODULE,   // only for MBTS
	TYPE,     // only for MBTS
	PMT1,
	PMT2,
	NSEG,
	TRACKX,
	TRACKY,
	TRACKZ,
	TRACKPT
};

// retrieved subdetectors
enum Detectors{
	TILE = 100,
	HEC,
	LAR,
	MBTS,
	TRACK
};

// declaration of pointer to infos gotten in the xml files
extern float ***energyp;
extern float ***energyn;
extern float ***phip;
extern float ***phin;
extern float ***etap;
extern float ***etan;
extern int   ***pmt1p;
extern int   ***pmt1n;
extern int   ***pmt2p;
extern int   ***pmt2n;
extern int   ****adc1p;
extern int   ****adc1n;
extern int   ****adc2p;
extern int   ****adc2n;
extern vector<int>   vnseg;
extern vector<float> vsegx, vsegy, vsegz;
extern vector<float> vpt;

using namespace std;

class SaxHandler
{

private:

	int     ru_num;
	int     ev_num;
	TString ev_tim;
	string _triggerType;

	unsigned int NCells, NTracks;
	int NSamp_til, NSamp_hec, NSamp_lar, NSamp_mbts;
	int state;
	int subdet;
	bool has_pmt_number;
	stringstream *ss;

	vector<float>       ven_til, ven_hec, ven_lar, ven_mbts;
	vector<float>       vet_til, vet_hec, vet_lar, vet_mbts;
	vector<float>       vph_til, vph_hec, vph_lar, vph_mbts;
	vector<long int>    vid_til, vid_hec, vid_lar;
	vector<int*>        va1_til, va1_hec, va1_lar, va1_mbts;
	vector<int*>        va2_til;
	vector<int>   vch_mbts, vmod_mbts, vty_mbts;
	vector<int>  _vpmt1_til, _vpmt2_til;

public:

	SaxHandler() {state = EVENT; ss = new stringstream;}

	void OnStartDocument()                   {}
	void OnEndDocument  ()                   {}
	void OnStartElement (const char*, const TList*);
	void OnEndElement   (const char*);
	void OnCharacters   (const char*);
	void OnComment      (const char*)        {}
	void OnWarning      (const char*)        {}
	void OnError        (const char*)        {}
	void OnFatalError   (const char*)        {}
	void OnCdataBlock   (const char*, Int_t) {}

	void GetDetector (const char*, const TList*);
	void GetParameter(const char*, const TList*);
	void GetEvInfo   (const char*, const TList*);

	void GetNCells   (const TList*);
	void GetNTracks  (const TList*);
	void GetNSamples (const TList*);

	int  GetNSampTile(){return NSamp_til;};
	int  GetNSampHEC (){return NSamp_hec;};
	int  GetNSampLArg(){return NSamp_lar;};

	void UpdateEnergy ();
	void UpdateId     ();
	void UpdateEta    ();
	void UpdatePhi    ();
	void UpdateADC1   ();
	void UpdateADC2   ();
	void UpdateCh     (); // only for MBTS
	void UpdateMod    (); // only for MBTS
	void UpdateType   (); // only for MBTS
	void UpdatePMT1   ();
	void UpdatePMT2   ();
	void UpdateNSeg   ();
	void UpdateTrackX ();
	void UpdateTrackY ();
	void UpdateTrackZ ();
	void UpdateTrackpt();

	void ParseFile(const char *fname);

	void populate();

	void SetEnergyTile(float, int, int, int, int);
	void SetEtaTile   (float, int, int, int, int);
	void SetPhiTile   (float, int, int, int, int);
	void SetADC1Tile  (int* , int, int, int, int);
	void SetADC2Tile  (int* , int, int, int, int);
	void SetPMT1Tile  (int, int, int, int, int);
	void SetPMT2Tile  (int, int, int, int, int);

	int         GetRunNum(){return ru_num;       }
	int         GetEveNum(){return ev_num;       }
	const char* GetEvDate(){return ev_tim.Data();}
	const char* GetTriggerType(){return _triggerType.c_str();}
};

#endif
