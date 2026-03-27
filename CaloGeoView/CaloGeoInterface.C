#include "TTimer.h"
#include "TFile.h"
#include "TTree.h"
#include "TGeoManager.h"
#include "TColor.h"
#include "TGLViewer.h"
#include "TGeoPhysicalNode.h"
#include "TGeoMatrix.h"
#include "TSystem.h"
#include "TGLSAViewer.h"
#include "TGLSAFrame.h"
#include "TGFrame.h"
#include "TGLPhysicalShape.h"
#include "TGLLogicalShape.h"
#include "TGraph.h"
#include "TPolyLine3D.h"

#include <iostream>
#include <set>
#include <string>

#include "CaloGeoConst.h"
#include "CaloGeoInterface.h"
#include "CaloGeoXML.h"
#include "CaloHough.h"

using namespace std;

// global variables ------------------------------------------------------------

// definition of pointers for all the geometry primitives (cells)
TGeoVolume ****CaloLayerp;
TGeoVolume ****CaloLayern;

TCanvas *gCanvas; // the main 3D canvas definition

// definition of number of ADC samples to each subdetector
int NSamp_til;
int NSamp_hec;
int NSamp_lar;

void (*cgvOnLoadFile)();
void (*cgvOnOnlineChange)(bool on);
void (*cgvOnNextByTimeChange)(bool on);
void (*cgvOnCurDirChange)(const char *dir);

TGeoVolume *Calo; // top volume

// detector bounds
TGeoVolume *BoundTileLArg;
TGeoVolume *BoundLArg;
TGeoVolume *BoundTile;
TGeoVolume *BoundTileHECp;
TGeoVolume *BoundTileHECn;
TGeoVolume *BoundTileEBp;
TGeoVolume *BoundTileEBn;
TGeoVolume *BoundHECp;
TGeoVolume *BoundHECn;

// timing handler
TTimer timer_animat(50  );
TTimer timer_online(5000);
TTimer timer_ofline(3000);

set<string> flist;

//State variables --------------------------------------------------------------

// timers
Long_t ofline_time = 3000; // miliseconds

bool timer_online_on = false;
bool timer_ofline_on = false;

float camera_dist  = 24000.0;
float camera_speed =     2.0;
float camera_angle =     0.0;

// thresholds and visibility
float tcThreshMin     = 0.25; // GeV
float tcThreshMax     = 10.0; // GeV
float heThreshMin     =  1.5; // GeV
float heThreshMax     = 10.0; // GeV
float laThreshMin     = 0.20; // GeV
float laThreshMax     = 10.0; // GeV

bool tcUseMaxThresh = false;
bool heUseMaxThresh = false;
bool laUseMaxThresh = false;

bool tcActivated = true;
bool heActivated = true;
bool laActivated = true;

bool eba_vis = true;
bool ebc_vis = true;
bool bar_vis = true;

// palette
float tcMaxColorValue = 2.0; // GeV
float tcMinColorValue = 0.0; // GeV
float heMaxColorValue = 5.0; // GeV
float heMinColorValue = 0.7; // GeV
float laMaxColorValue = 1.0; // GeV
float laMinColorValue = 0.0; // GeV

int tcPalette =   HOT;
int hePalette =  BLUE;
int laPalette = GREEN;

// input
TString      online_dir = "/tmp/atlantis";
TString      ofline_dir = ".";
TString      filename   =  "";

const char* triggerType = NULL;
int         file_index  = -1;
int         run_num;
int          ev_num;
TString     ev_time;

// bounds
int ba_bound = TILELARG_BOUND;
int eb_bound =  TILEHEC_BOUND;

// tracks
bool  show_tracks     = false;
bool  show_xml_tracks = true;
float track_thresh    =  1.0;

vector<TPolyLine3D *> tracks;

// auxiliar functions ----------------------------------------------------------

void GetGeoVolumes()
{
	int i, j, k;
	TGeoVolume *layerp, *layern, *etap2, *etan2;

	// get TGeoVolume pointers -------------------------------------------------

	TGeoManager::Import("CaloGeometry.root");

	Calo = gGeoManager->GetVolume("Calo");

	CaloLayerp = new TGeoVolume***[NLAYER];
	CaloLayern = new TGeoVolume***[NLAYER];
	energyp    = new       float**[NLAYER];
	energyn    = new       float**[NLAYER];
	phip       = new       float**[NLAYER];
	phin       = new       float**[NLAYER];
	etap       = new       float**[NLAYER];
	etan       = new       float**[NLAYER];
	adc1p      = new       int ***[NLAYER];
	adc1n      = new       int ***[NLAYER];
	adc1p      = new       int ***[NLAYER];
	adc1n      = new       int ***[NLAYER];
	adc2p      = new       int ***[12];
	adc2n      = new       int ***[12];

	pmt1p = new int**[NLAYER];
	pmt1n = new int**[NLAYER];
	pmt2p = new int**[NLAYER];
	pmt2n = new int**[NLAYER];

	for (i = 0; i < NLAYER; i++)
	{
		CaloLayerp[i] = new TGeoVolume**[eta_size[i]];
		CaloLayern[i] = new TGeoVolume**[eta_size[i]];
		   energyp[i] = new       float*[eta_size[i]];
		   energyn[i] = new       float*[eta_size[i]];
		      phip[i] = new       float*[eta_size[i]];
		      phin[i] = new       float*[eta_size[i]];
		      etap[i] = new       float*[eta_size[i]];
		      etan[i] = new       float*[eta_size[i]];
		     adc1p[i] = new       int **[eta_size[i]];
		     adc1n[i] = new       int **[eta_size[i]];

		     pmt1p[i] = new       int  *[eta_size[i]];
		     pmt1n[i] = new       int  *[eta_size[i]];
		     pmt2p[i] = new       int  *[eta_size[i]];
		     pmt2n[i] = new       int  *[eta_size[i]];
		if (i < 12)
		{
			adc2p[i] = new    int **[eta_size[i]];
			adc2n[i] = new    int **[eta_size[i]];
		}

		layerp = Calo->GetNode(2*i  )->GetVolume();
		layern = Calo->GetNode(2*i+1)->GetVolume();

		for (j = 0; j < eta_size[i]; j++)
		{
			CaloLayerp[i][j] = new TGeoVolume*[phi_size[i]];
			CaloLayern[i][j] = new TGeoVolume*[phi_size[i]];
			   energyp[i][j] = new       float[phi_size[i]];
			   energyn[i][j] = new       float[phi_size[i]];
			      phip[i][j] = new       float[phi_size[i]];
			      phin[i][j] = new       float[phi_size[i]];
			      etap[i][j] = new       float[phi_size[i]];
			      etan[i][j] = new       float[phi_size[i]];
			     adc1p[i][j] = new       int *[phi_size[i]];
			     adc1n[i][j] = new       int *[phi_size[i]];

			     pmt1p[i][j] = new       int  [phi_size[i]];
			     pmt1n[i][j] = new       int  [phi_size[i]];
			     pmt2p[i][j] = new       int  [phi_size[i]];
			     pmt2n[i][j] = new       int  [phi_size[i]];
			if (i < 12)
			{
				adc2p[i][j] = new    int *[phi_size[i]];
				adc2n[i][j] = new    int *[phi_size[i]];
			}

			etap2 = layerp->GetNode(j)->GetVolume();
			etan2 = layern->GetNode(j)->GetVolume();

			for (k = 0; k < phi_size[i]; k++)
			{
				adc1p[i][j][k] = 0;
				adc1n[i][j][k] = 0;
				if (i < 12)
				{
					adc2p[i][j][k] = 0;
					adc2n[i][j][k] = 0;
				}
				CaloLayerp[i][j][k] = etap2->GetNode(k)->GetVolume();
				CaloLayern[i][j][k] = etan2->GetNode(k)->GetVolume();
			}
		}
	}

	BoundTileLArg = gGeoManager->GetVolume("LBTileLArg");
	BoundTile     = gGeoManager->GetVolume("LBTile"    );
	BoundLArg     = gGeoManager->GetVolume("LBLArg"    );

	BoundTileHECp = gGeoManager->GetVolume("EBTileHECp");
	BoundTileHECn = gGeoManager->GetVolume("EBTileHECn");
	BoundTileEBp  = gGeoManager->GetVolume("EBTilep"   );
	BoundTileEBn  = gGeoManager->GetVolume("EBTilen"   );
	BoundHECp     = gGeoManager->GetVolume("EBHECp"    );
	BoundHECn     = gGeoManager->GetVolume("EBHECn"    );

}

void ClearTile()
{
	int i, j, k;

	for (i = 0; i < NLAY_TILE; i++)
	{
		for (j = 0; j < eta_size[i]; j++)
		{
			for (k = 0; k < phi_size[i]; k++)
			{
				CaloLayerp[i][j][k]->SetVisibility(false);
				CaloLayern[i][j][k]->SetVisibility(false);
				if  (adc1p[i][j][k]) {delete [] adc1p[i][j][k]; adc1p[i][j][k] = 0;}
				if  (adc1n[i][j][k]) {delete [] adc1n[i][j][k]; adc1n[i][j][k] = 0;}
				if (i < 12){
				if  (adc2p[i][j][k]) {delete [] adc2p[i][j][k]; adc2p[i][j][k] = 0;}
				if  (adc2n[i][j][k]) {delete [] adc2n[i][j][k]; adc2n[i][j][k] = 0;}}
				   energyp[i][j][k] = -9999;
				   energyn[i][j][k] = -9999;
			}
		}
	}
}

void EraseTile()
{
	int i,j,k;

	for (i = 0; i < NLAY_TILE; i++)
	{
		for (j = 0; j < eta_size[i]; j++)
		{
			for (k = 0; k < phi_size[i]; k++)
			{
				CaloLayerp[i][j][k]->SetVisibility(false);
				CaloLayern[i][j][k]->SetVisibility(false);
			}
		}
	}
}

void ClearHEC()
{
	int i,j,k;

	for (i = NLAY_TILE; i < NLAY_TILE + NLAY_HEC; i++)
	{
		for (j = 0; j < eta_size[i]; j++)
		{
			for (k = 0; k < phi_size[i]; k++)
			{
				CaloLayerp[i][j][k]->SetVisibility(false);
				CaloLayern[i][j][k]->SetVisibility(false);
				if  (adc1p[i][j][k]) {delete [] adc1p[i][j][k]; adc1p[i][j][k] = 0;}
				if  (adc1n[i][j][k]) {delete [] adc1n[i][j][k]; adc1n[i][j][k] = 0;}
				   energyp[i][j][k] = -9999;
				   energyn[i][j][k] = -9999;
			}
		}
	}
}

void EraseHEC()
{
	int i,j,k;

	for (i = NLAY_TILE; i < NLAY_TILE + NLAY_HEC; i++)
	{
		for (j = 0; j < eta_size[i]; j++)
		{
			for (k = 0; k < phi_size[i]; k++)
			{
				CaloLayerp[i][j][k]->SetVisibility(false);
				CaloLayern[i][j][k]->SetVisibility(false);
			}
		}
	}
}

void ClearLAr()
{
	int i,j,k;

	for (i = NLAY_TILE + NLAY_HEC; i < NLAYER; i++)
	{
		for (j = 0; j < eta_size[i]; j++)
		{
			for (k = 0; k < phi_size[i]; k++)
			{
				CaloLayerp[i][j][k]->SetVisibility(false);
				CaloLayern[i][j][k]->SetVisibility(false);
				if  (adc1p[i][j][k]) {delete [] adc1p[i][j][k]; adc1p[i][j][k] = 0;}
				if  (adc1n[i][j][k]) {delete [] adc1n[i][j][k]; adc1n[i][j][k] = 0;}
				   energyp[i][j][k] = -9999;
				   energyn[i][j][k] = -9999;
			}
		}
	}
}

void EraseLAr()
{
	int i,j,k;

	for (i = NLAY_TILE + NLAY_HEC; i < NLAYER; i++)
	{
		for (j = 0; j < eta_size[i]; j++)
		{
			for (k = 0; k < phi_size[i]; k++)
			{
				CaloLayerp[i][j][k]->SetVisibility(false);
				CaloLayern[i][j][k]->SetVisibility(false);
			}
		}
	}
}

void Clear()
{
	ClearTile();
	ClearHEC ();
	ClearLAr ();

	cgvClearTracks();
}

bool SetVisibility(TGeoVolume *gv, float th_min, float th_max, bool use_max, float value)
{
	bool is_visible = (value > th_min) && ((!use_max) || (value < th_max));
	gv->SetVisibility(is_visible);
	return is_visible;
}

void SetColor(TGeoVolume *gv, int palette, float min_value, float max_value, Float_t value)
{
	int v = palette + (int)(255.0*(value-min_value)/(max_value-min_value));

	if (v < palette    ) v = palette;
	if (v > palette+255) v = palette+255;

	gv->SetLineColor(v);
}

void UpdateTileBar()
{
	int i,j,k;

	for (i = 0; i < 3; i++)
	{
		for (j = 0; j < eta_size[i]; j++)
		{
			for (k = 0; k < phi_size[i]; k++)
			{
				if (energyp[i][j][k] != -9999 && SetVisibility(CaloLayerp[i][j][k], tcThreshMin, tcThreshMax, tcUseMaxThresh, energyp[i][j][k]))
					SetColor(CaloLayerp[i][j][k], tcPalette, tcMinColorValue, tcMaxColorValue, energyp[i][j][k]);
				if (energyn[i][j][k] != -9999 && SetVisibility(CaloLayern[i][j][k], tcThreshMin, tcThreshMax, tcUseMaxThresh, energyn[i][j][k]))
					SetColor(CaloLayern[i][j][k], tcPalette, tcMinColorValue, tcMaxColorValue, energyn[i][j][k]);
			}
		}
	}
}

void UpdateTileEBA()
{
	int i,j,k;

	for (i = 3; i < NLAY_TILE; i++)
	{
		for (j = 0; j < eta_size[i]; j++)
		{
			for (k = 0; k < phi_size[i]; k++)
			{
				if (energyp[i][j][k] != -9999 && SetVisibility(CaloLayerp[i][j][k], tcThreshMin, tcThreshMax, tcUseMaxThresh, energyp[i][j][k]))
					SetColor(CaloLayerp[i][j][k], tcPalette, tcMinColorValue, tcMaxColorValue, energyp[i][j][k]);
			}
		}
	}
}

void UpdateTileEBC()
{
	int i,j,k;

	for (i = 3; i < NLAY_TILE; i++)
	{
		for (j = 0; j < eta_size[i]; j++)
		{
			for (k = 0; k < phi_size[i]; k++)
			{
				if (energyn[i][j][k] != -9999 && SetVisibility(CaloLayern[i][j][k], tcThreshMin, tcThreshMax, tcUseMaxThresh, energyn[i][j][k]))
					SetColor(CaloLayern[i][j][k], tcPalette, tcMinColorValue, tcMaxColorValue, energyn[i][j][k]);
			}
		}
	}
}

void UpdateTile()
{
	if (bar_vis) UpdateTileBar();
	if (eba_vis) UpdateTileEBA();
	if (ebc_vis) UpdateTileEBC();
}

void UpdateHECEBA()
{
	int i,j,k;

	for (i = NLAY_TILE; i < NLAY_TILE + NLAY_HEC; i++)
	{
		for (j = 0; j < eta_size[i]; j++)
		{
			for (k = 0; k < phi_size[i]; k++)
			{
				if (energyp[i][j][k] != -9999 && SetVisibility(CaloLayerp[i][j][k], heThreshMin, heThreshMax, heUseMaxThresh, energyp[i][j][k]))
					SetColor(CaloLayerp[i][j][k], hePalette, heMinColorValue, heMaxColorValue, energyp[i][j][k]);
			}
		}
	}
}

void UpdateHECEBC()
{
	int i,j,k;

	for (i = NLAY_TILE; i < NLAY_TILE + NLAY_HEC; i++)
	{
		for (j = 0; j < eta_size[i]; j++)
		{
			for (k = 0; k < phi_size[i]; k++)
			{
				if (energyn[i][j][k] != -9999 && SetVisibility(CaloLayern[i][j][k], heThreshMin, heThreshMax, heUseMaxThresh, energyn[i][j][k]))
					SetColor(CaloLayern[i][j][k], hePalette, heMinColorValue, heMaxColorValue, energyn[i][j][k]);
			}
		}
	}
}

void UpdateHEC()
{
	if (eba_vis) UpdateHECEBA();
	if (ebc_vis) UpdateHECEBC();
}

void UpdateLArBar()
{
	int i,j,k;
	float ene;
	TGeoVolume *gv;

	for (i = NLAY_TILE + NLAY_HEC; i < NLAY_TILE + NLAY_HEC + NLAY_LAR; i++)
	{
		for (j = 0; j < eta_size[i]; j++)
		{
			for (k = 0; k < phi_size[i]; k++)
			{
				ene = energyp[i][j][k];
				gv  = CaloLayerp[i][j][k];
				if (ene != -9999 && SetVisibility(gv, laThreshMin, laThreshMax, laUseMaxThresh, ene))
					SetColor(gv, laPalette, laMinColorValue, laMaxColorValue, ene);
				ene = energyn[i][j][k];
				gv  = CaloLayern[i][j][k];
				if (ene != -9999 && SetVisibility(gv, laThreshMin, laThreshMax, laUseMaxThresh, ene))
					SetColor(gv, laPalette, laMinColorValue, laMaxColorValue, ene);
			}
		}
	}
}

void UpdateLArEBA()
{
	int i,j,k;

	for (i = NLAY_TILE + NLAY_HEC + NLAY_LAR; i < NLAYER; i++)
	{
		for (j = 0; j < eta_size[i]; j++)
		{
			for (k = 0; k < phi_size[i]; k++)
			{
				if (energyp[i][j][k] != -9999 && SetVisibility(CaloLayerp[i][j][k], laThreshMin, laThreshMax, laUseMaxThresh, energyp[i][j][k]))
					SetColor(CaloLayerp[i][j][k], laPalette, laMinColorValue, laMaxColorValue, energyp[i][j][k]);
			}
		}
	}
}

void UpdateLArEBC()
{
	int i,j,k;

	for (i = NLAY_TILE + NLAY_HEC + NLAY_LAR; i < NLAYER; i++)
	{
		for (j = 0; j < eta_size[i]; j++)
		{
			for (k = 0; k < phi_size[i]; k++)
			{
				if (energyn[i][j][k] != -9999 && SetVisibility(CaloLayern[i][j][k], laThreshMin, laThreshMax, laUseMaxThresh, energyn[i][j][k]))
					SetColor(CaloLayern[i][j][k], laPalette, laMinColorValue, laMaxColorValue, energyn[i][j][k]);
			}
		}
	}
}

void UpdateLAr()
{
	if (bar_vis) UpdateLArBar();
	if (eba_vis) UpdateLArEBA();
	if (ebc_vis) UpdateLArEBC();
}

void GenPalette(const int *x, const float *y, int size)
{
	static int cnt = GRAY;

	int   i, j, k;
	float color[3][256];

	for (i = 0; i < 3; i++)
		for (j = 0; j < size-1; j++)
			for (k = x[j]; k <= x[j+1]; k++)
				color[i][k] = (y[3*i+j]-y[3*i+j+1])/(x[j]-x[j+1])*(k-x[j]) + y[3*i+j];

	for (i = 0; i < 256; i++) new TColor(cnt++, color[0][i], color[1][i], color[2][i]);
}

void GenPalette()
{
	// constants ---------------------------------------------------------------

	const int   grax[3] = {  0, 128, 255};
	const float gray[9] = {1.0, 0.6, 0.2,
	                       1.0, 0.6, 0.2,
	                       1.0, 0.6, 0.2};

	const int   hotx[3] = {  0, 200, 255};
	const float hoty[9] = {1.0, 0.6, 0.5,
	                       1.0, 0.0, 0.0,
	                       0.0, 0.0, 0.0};

	const int   grex[3] = {  0, 200, 255};
	const float grey[9] = {0.0, 0.3, 0.4,
	                       1.0, 0.3, 0.0,
	                       0.0, 0.3, 0.4};

	const int   blux[3] = {  0, 128, 255};
	const float bluy[9] = {0.0, 0.0, 0.0,
	                       0.9, 0.5, 0.0,
	                       1.0, 0.7, 0.4};

	const int   copx[3] = {  0,  64, 255};
	const float copy[9] = {1.0, 1.0, 0.2,
	                       0.8, 0.6, 0.2,
	                       0.5, 0.4, 0.2};

	// do palette --------------------------------------------------------------

	GenPalette(grax, gray, 3);
	GenPalette(hotx, hoty, 3);
	GenPalette(grex, grey, 3);
	GenPalette(blux, bluy, 3);
	GenPalette(copx, copy, 3);
}

void SetupViewer(TGCompositeFrame* parentFrame)
{
	gCanvas = new TCanvas("","",10,10);
	Calo->Draw("ogl");
	
	TGLViewer    *v = (TGLViewer  *)gPad->GetViewer3D();
	TGLSAViewer *av = (TGLSAViewer*)gPad->GetViewer3D();
	
	cgvSetGraphicStyle(OUTLINE);
	cgvSetBounds(ba_bound, eb_bound);

	cgvSetBckGroundColor(TColor::RGB2Pixel((Float_t)1.0,(Float_t)1.0,(Float_t)1.0));
	    cgvSetBoundColor(TColor::RGB2Pixel((Float_t)1.0,(Float_t)1.0,(Float_t)1.0));

	v->SetResetCamerasOnUpdate(false);
	
	TGFrame* mainFrame = av->GetFrame();
	TGFrame*   glFrame = mainFrame->GetFrameFromPoint(mainFrame->GetWidth()/2, mainFrame->GetHeight()/2);

	  mainFrame->UnmapWindow();
	parentFrame->UnmapWindow();

	glFrame->ReparentWindow(parentFrame);
	parentFrame->AddFrame(glFrame, new TGLayoutHints(kLHintsExpandX | kLHintsExpandY));
	parentFrame->MapSubwindows();
	parentFrame->Resize();
	parentFrame->MapWindow();
	//parentFrame->MapRaised();
}

void Animate()
{
	double center[3] = {0,0,0};

	gCanvas->cd();
	TGLViewer *v = (TGLViewer *)gPad->GetViewer3D();
	v->SetPerspectiveCamera(TGLViewer::kCameraPerspXOZ, 30.0, 0.0, center, 0.0, camera_speed/100.0);
}

void ListXMLFilesInDir(const char *dir)
{
	// variables ---------------------------------------------------------------

	const char *file;

	// Fill temporary containers with file names and date ----------------------

	void *dirp = gSystem->OpenDirectory(dir);

	flist.clear();
	while ((file = gSystem->GetDirEntry(dirp)))
	{
		if (strstr(file, ".xml")) flist.insert(file);
	}
}

void LoadXMLFile(const char *fname)
{
	Clear();

	SaxHandler saxHandler;
	saxHandler.ParseFile(fname);

	  run_num   = saxHandler.GetRunNum     ();
	   ev_num   = saxHandler.GetEveNum     ();
	  ev_time   = saxHandler.GetEvDate     ();
	NSamp_til   = saxHandler.GetNSampTile  ();
	NSamp_hec   = saxHandler.GetNSampHEC   ();
	NSamp_lar   = saxHandler.GetNSampLArg  ();
	triggerType = saxHandler.GetTriggerType();

	cgvUpdate();

	filename = gSystem->BaseName(fname);

	if (*cgvOnLoadFile) (*cgvOnLoadFile)();
}

void LoadNextFile()
{
	unsigned int index = file_index+1;
	if (index == flist.size()) index = 0;
	cgvLoadXMLFileByIndex(index);
}

void LoadLastFileInFolder(const char *dir)
{
	ListXMLFilesInDir(dir);

	if (flist.size() > 1)
	{
		// actually should be one before the latest, to make sure the file is complete
		set<string>::iterator it = flist.end(); it--; it--;
		LoadXMLFile(Form("%s/%s", dir, (*it).c_str()));
	}
}

// implementation --------------------------------------------------------------

void cgvInit(TGCompositeFrame* parentFrame)
{
	GetGeoVolumes();
	Clear        ();
	GenPalette   ();
	SetupViewer  (parentFrame);

	timer_animat.SetCommand("Animate()");
	timer_online.SetCommand("LoadLastFileInFolder(online_dir)");
	timer_ofline.SetCommand("LoadNextFile()");
}

bool cgvLoadXMLFileByIndex(unsigned int index)
{
	if (index < flist.size()) 
	{
		file_index = index;

		set<string>::iterator it = flist.begin();
		for (unsigned int i = 0; i < index; i++) it++;
		LoadXMLFile(Form("%s/%s", ofline_dir.Data(), (*it).c_str()));
		return true;
	}
	else
	{
		file_index = flist.size()-1;
		return false;
	}
}

void cgvLoadXMLFile(const char *fname)
{
	if (timer_online_on) return;

	ofline_dir = (char*)gSystem->DirName(fname);
	ListXMLFilesInDir(ofline_dir);

	file_index = -1;
	set<string>::iterator it;
	for (it = flist.begin(); it != flist.end(); it++)
	{
		file_index++;
		if (strcmp((*it).c_str(), gSystem->BaseName(fname)) == 0) break;
	}

	cgvLoadXMLFileByIndex(file_index);

	if (*cgvOnCurDirChange) (*cgvOnCurDirChange)(ofline_dir.Data());
}

void cgvSetOnlineDir(const char *dir)
{
	online_dir = (char*) dir;
}

void cgvSetTileThreshMin(float val)
{
	tcThreshMin = val;
	cgvUpdate();
}

void cgvSetHECThreshMin(float val)
{
	heThreshMin = val;
	cgvUpdate();
}

void cgvSetLArgThreshMin(float val)
{
	laThreshMin = val;
	cgvUpdate();
}

void cgvSetTileThreshMax(float val)
{
	tcThreshMax = val;
	cgvUpdate();
}

void cgvSetHECThreshMax(float val)
{
	heThreshMax = val;
	cgvUpdate();
}

void cgvSetLArgThreshMax(float val)
{
	laThreshMax = val;
	cgvUpdate();
}

void cgvAnimate(bool ok)
{
	if (ok) timer_animat.TurnOn(); else timer_animat.TurnOff();
}

void cgvSetOnline(bool on)
{
	if (on == timer_online_on) return;
	timer_online_on = on;
	if (on) cgvLoadNextFileByTime(false);
	if (on) timer_online.TurnOn(); else timer_online.TurnOff();
	if (*cgvOnOnlineChange) (*cgvOnOnlineChange)(on);
	if (on) {if (*cgvOnCurDirChange) (*cgvOnCurDirChange)(online_dir.Data());}
}

void cgvLoadNextFileByTime(bool on)
{
	if (on == timer_ofline_on) return;
	if (on && timer_online_on) return;
	timer_ofline_on = on;
	if (on) timer_ofline.TurnOn(); else timer_ofline.TurnOff();
	if (*cgvOnNextByTimeChange) (*cgvOnNextByTimeChange)(on);
}

void cgvSetNextFileTime(Long_t time)
{
	ofline_time = time;
	timer_ofline.SetTime(time);
}

void cgvBarVisible(bool visible)
{
	int  i, j, k;

	bar_vis = visible;

	// Outline -----------------------------------------------------------------

	cgvSetBounds(ba_bound, eb_bound);

	// TileCal -----------------------------------------------------------------

	if (visible and tcActivated)
	{
		UpdateTileBar();
	}
	else
	{
		for (i = 0; i < 3; i++)
		{
			for (j = 0; j < eta_size[i]; j++)
			{
				for (k = 0; k < phi_size[i]; k++)
				{
					CaloLayerp[i][j][k]->SetVisibility(false);
					CaloLayern[i][j][k]->SetVisibility(false);
				}
			}
		}
	}

	// LAr ---------------------------------------------------------------------

	if (visible and laActivated)
	{
		UpdateLArBar();
	}
	else
	{
		for (i = NLAY_TILE + NLAY_HEC; i < NLAY_TILE + NLAY_HEC + NLAY_LAR; i++)
		{
			for (j = 0; j < eta_size[i]; j++)
			{
				for (k = 0; k < phi_size[i]; k++)
				{
					CaloLayerp[i][j][k]->SetVisibility(false);
					CaloLayern[i][j][k]->SetVisibility(false);
				}
			}
		}
	}

	TGLViewer *v = (TGLViewer *)gPad->GetViewer3D();
	v->UpdateScene();
}

void cgvEBVisible(bool visible, bool Aside)
{
	int  i, j, k;
	char s; if (Aside) s = 'p'; else s = 'n';

	if (Aside) eba_vis = visible; else ebc_vis = visible;

	// Outline -----------------------------------------------------------------

	cgvSetBounds(ba_bound, eb_bound);

	// TileCal -----------------------------------------------------------------

	if (visible and tcActivated)
	{
		if (Aside) UpdateTileEBA(); else UpdateTileEBC();
	}
	else
	{
		TGeoVolume ****vol;
		if (Aside) vol = CaloLayerp; else vol = CaloLayern;

		for (i = 3; i < NLAY_TILE; i++)
		{
			for (j = 0; j < eta_size[i]; j++)
			{
				for (k = 0; k < phi_size[i]; k++)
				{
					vol[i][j][k]->SetVisibility(false);
				}
			}
		}
	}

	// HEC ---------------------------------------------------------------------

	if (visible and heActivated)
	{
		if (Aside) UpdateHECEBA(); else UpdateHECEBC();
	}
	else
	{
		TGeoVolume ****vol;
		if (Aside) vol = CaloLayerp; else vol = CaloLayern;

		for (i = NLAY_TILE; i < NLAY_TILE + NLAY_HEC; i++)
		{
			for (j = 0; j < eta_size[i]; j++)
			{
				for (k = 0; k < phi_size[i]; k++)
				{
					vol[i][j][k]->SetVisibility(false);
				}
			}
		}
	}

	// LAr ---------------------------------------------------------------------

	if (visible and laActivated)
	{
		if (Aside) UpdateLArEBA(); else UpdateLArEBC();
	}
	else
	{
		TGeoVolume ****vol;
		if (Aside) vol = CaloLayerp; else vol = CaloLayern;

		for (i = NLAY_TILE + NLAY_HEC + NLAY_LAR; i < NLAYER; i++)
		{
			for (j = 0; j < eta_size[i]; j++)
			{
				for (k = 0; k < phi_size[i]; k++)
				{
					vol[i][j][k]->SetVisibility(false);
				}
			}
		}
	}

	TGLViewer *v = (TGLViewer *)gPad->GetViewer3D();
	v->UpdateScene();
}

void cgvEBshift(float shift, bool Aside)
{
	int    i;
	char   s; if (Aside) s  =   'p'; else  s =    'n';
	float sh; if (Aside) sh = shift; else sh = -shift;

	// Outline -----------------------------------------------------------------

	TGeoPhysicalNode *pn;
	pn = new TGeoPhysicalNode(Form("EBTileHEC%c_0", s));
	pn->Align(new TGeoTranslation(0,0,sh));
	if (Aside) BoundTileHECp = pn->GetVolume(); else BoundTileHECn = pn->GetVolume();
	delete pn;

	pn = new TGeoPhysicalNode(Form("EBTile%c_0", s));
	pn->Align(new TGeoTranslation(0,0,sh));
	if (Aside) BoundTileEBp = pn->GetVolume(); else BoundTileEBn = pn->GetVolume();
	delete pn;

	pn = new TGeoPhysicalNode(Form("EBHEC%c_0", s));
	pn->Align(new TGeoTranslation(0,0,sh));
	if (Aside) BoundHECp = pn->GetVolume(); else BoundHECn = pn->GetVolume();
	delete pn;

	// TileCal -----------------------------------------------------------------

	for (i = 3; i < NLAY_TILE; i++)
	{
		pn = new TGeoPhysicalNode(Form("Calo_1/Tile%d%c_0", i+2, s));
		pn->Align(new TGeoTranslation(0,0,sh));
		delete pn;
	}

	// HEC ---------------------------------------------------------------------

	const char *d[4] = {"1", "23", "45", "67"};

	for (i = 0; i < 4; i++)
	{
		pn = new TGeoPhysicalNode(Form("Calo_1/HEC%s%c_0", d[i], s));
		pn->Align(new TGeoTranslation(0,0,sh));
		delete pn;
	}

	// LArg --------------------------------------------------------------------

	for (i = 0; i < 4; i++)
	{
		pn = new TGeoPhysicalNode(Form("Calo_1/EMEndCap%d%c_1", i, s));
		pn->Align(new TGeoTranslation(0,0,sh));
		delete pn;
	}

	TGLViewer *v = (TGLViewer *)gPad->GetViewer3D();
	v->UpdateScene();
}

void cgvSetMinColorValueTile(float val)
{
	if (val == tcMinColorValue) return;
	if (val < 0)                return;
	tcMinColorValue = val;

	UpdateTile  ();
	 gCanvas->cd();
	gPad->Update();
}

void cgvSetMaxColorValueTile(float val)
{
	if (val == tcMaxColorValue) return;
	if (val < 0)                return;
	tcMaxColorValue = val;

	UpdateTile  ();
	 gCanvas->cd();
	gPad->Update();
}

void cgvSetMaxColorValueLArg(float val)
{
	if (val == laMaxColorValue) return;
	if (val < 0)                return;
	laMaxColorValue = val;

	UpdateLAr  ();
	 gCanvas->cd();
	gPad->Update();
}

void cgvSetMinColorValueHEC(float val)
{
	if (val == heMinColorValue) return;
	if (val < 0)                return;
	heMinColorValue = val;

	UpdateHEC  ();
	 gCanvas->cd();
	gPad->Update();
}

void cgvSetMinColorValueLArg(float val)
{
	if (val == laMinColorValue) return;
	if (val < 0)                return;
	laMinColorValue = val;

	UpdateLAr  ();
	 gCanvas->cd();
	gPad->Update();
}

void cgvSetMaxColorValueHEC(float val)
{
	if (val == heMaxColorValue) return;
	if (val < 0)                return;
	heMaxColorValue = val;

	UpdateHEC  ();
	 gCanvas->cd();
	gPad->Update();
}

void cgvSetMinColorValueLAr(float val)
{
	if (val == laMinColorValue) return;
	if (val < 0)                return;
	laMinColorValue = val;

	UpdateLAr  ();
	 gCanvas->cd();
	gPad->Update();
}

void cgvSetMaxColorValueLAr(float val)
{
	if (val == laMaxColorValue) return;
	if (val < 0)                return;
	laMaxColorValue = val;

	UpdateLAr  ();
	 gCanvas->cd();
	gPad->Update();
}

void cgvSetTileActivated(bool activated)
{
	if (activated == tcActivated) return;
	tcActivated = activated;

	if (tcActivated) UpdateTile(); else EraseTile();

	 gCanvas->cd();
	gPad->Update();
}

void cgvSetHECActivated(bool activated)
{
	if (activated == heActivated) return;
	heActivated = activated;

	if (heActivated) UpdateHEC(); else EraseHEC();

	 gCanvas->cd();
	gPad->Update();
}

void cgvSetLArgActivated(bool activated)
{
	if (activated == laActivated) return;
	laActivated = activated;

	if (laActivated) UpdateLAr(); else EraseLAr();

	 gCanvas->cd();
	gPad->Update();
}

void cgvSetLArActivated(bool activated)
{
	if (activated == laActivated) return;
	laActivated = activated;

	if (laActivated) UpdateLAr(); else EraseLAr();

	 gCanvas->cd();
	gPad->Update();
}

void cgvSetUseMaxThreshTile(bool use)
{
	if (use == tcUseMaxThresh) return;
	tcUseMaxThresh = use;

	UpdateTile  ();
	 gCanvas->cd();
	gPad->Update();
}

void cgvSetUseMaxThreshLArg(bool use)
{
	if (use == laUseMaxThresh) return;
	laUseMaxThresh = use;

	UpdateLAr  ();
	 gCanvas->cd();
	gPad->Update();
}

void cgvSetPaletteTile(int palette)
{
	if (tcPalette == palette) return;
	tcPalette = palette;

	UpdateTile  ();
	 gCanvas->cd();
	gPad->Update();
}

void cgvSetUseMaxThreshHEC(bool use)
{
	if (use == heUseMaxThresh) return;
	heUseMaxThresh = use;

	UpdateHEC  ();
	 gCanvas->cd();
	gPad->Update();
}

void cgvSetPaletteHEC(int palette)
{
	if (hePalette == palette) return;
	hePalette = palette;

	UpdateHEC  ();
	 gCanvas->cd();
	gPad->Update();
}

void cgvSetPaletteLArg(int palette)
{
	if (laPalette == palette) return;
	laPalette = palette;

	UpdateLAr  ();
	 gCanvas->cd();
	gPad->Update();
}

void cgvSetUseMaxThreshLAr(bool use)
{
	if (use == laUseMaxThresh) return;
	laUseMaxThresh = use;

	UpdateLAr  ();
	 gCanvas->cd();
	gPad->Update();
}

void cgvSetPaletteLAr(int palette)
{
	if (laPalette == palette) return;
	laPalette = palette;

	UpdateLAr  ();
	 gCanvas->cd();
	gPad->Update();
}

void cgvSetBounds(int ba, int eb)
{
	ba_bound = ba; eb_bound = eb;

	BoundTileLArg->SetVisibility(ba == TILELARG_BOUND && bar_vis);
	    BoundTile->SetVisibility(ba ==     TILE_BOUND && bar_vis);
	    BoundLArg->SetVisibility(ba ==     LARG_BOUND && bar_vis);

	BoundTileHECp->SetVisibility(eb ==  TILEHEC_BOUND && eba_vis);
	BoundTileHECn->SetVisibility(eb ==  TILEHEC_BOUND && ebc_vis);
	 BoundTileEBp->SetVisibility(eb ==     TILE_BOUND && eba_vis);
	 BoundTileEBn->SetVisibility(eb ==     TILE_BOUND && ebc_vis);
	    BoundHECp->SetVisibility(eb ==      HEC_BOUND && eba_vis);
	    BoundHECn->SetVisibility(eb ==      HEC_BOUND && ebc_vis);

	TGLViewer *v = (TGLViewer *)gPad->GetViewer3D();
	v->UpdateScene();
}

void cgvSetBoundTransparency(char transp)
{
	BoundTileLArg->SetTransparency(transp);
	    BoundTile->SetTransparency(transp);
	    BoundLArg->SetTransparency(transp);

	BoundTileHECp->SetTransparency(transp);
	BoundTileHECn->SetTransparency(transp);
	 BoundTileEBp->SetTransparency(transp);
	 BoundTileEBn->SetTransparency(transp);
	    BoundHECp->SetTransparency(transp);
	    BoundHECn->SetTransparency(transp);

	TGLViewer *v = (TGLViewer *)gPad->GetViewer3D();
	v->UpdateScene();
}

void cgvSetBoundColor(Pixel_t color)
{
	BoundTileLArg->SetLineColor(TColor::GetColor(color));
	    BoundTile->SetLineColor(TColor::GetColor(color));
	    BoundLArg->SetLineColor(TColor::GetColor(color));

	BoundTileHECp->SetLineColor(TColor::GetColor(color));
	BoundTileHECn->SetLineColor(TColor::GetColor(color));
	 BoundTileEBp->SetLineColor(TColor::GetColor(color));
	 BoundTileEBn->SetLineColor(TColor::GetColor(color));
	    BoundHECp->SetLineColor(TColor::GetColor(color));
	    BoundHECn->SetLineColor(TColor::GetColor(color));

	TGLViewer *v = (TGLViewer *)gPad->GetViewer3D();
	v->UpdateScene();
}

void cgvSetGraphicStyle(int style)
{
	TGLViewer *v = (TGLViewer *)gPad->GetViewer3D();

	/*switch (style)
	{
		case WIREFRAME: v->SetDrawStyle(TGLDrawFlags::kWireFrame); break;
		case     SOLID: v->SetDrawStyle(TGLDrawFlags::kFill     ); break;
		case   OUTLINE: v->SetDrawStyle(TGLDrawFlags::kOutline  ); break;
	}*/

	switch (style)
	{
		case WIREFRAME: v->SetStyle(TGLRnrCtx::kWireFrame); break;
		case     SOLID: v->SetStyle(TGLRnrCtx::kFill     ); break;
		case   OUTLINE: v->SetStyle(TGLRnrCtx::kOutline  ); break;
	}

	v->UpdateScene();
}

void cgvSetBckGroundColor(Pixel_t color)
{
	TGLViewer *v = (TGLViewer *)gPad->GetViewer3D();
	v->SetClearColor(TColor::GetColor(color));
	v->UpdateScene();
}

void cgvSetCameraDist(float dist)
{
	camera_dist = dist;
}

void cgvSetCameraSpeed(float speed)
{
	camera_speed = speed;
}

void cgvSetCameraAngle(float angle)
{
	camera_angle = angle;
}

void cgvUpdate()
{
	if (tcActivated) UpdateTile();
	if (heActivated) UpdateHEC ();
	if (laActivated) UpdateLAr ();

	gCanvas->cd();
	gPad->Modified();
	gPad->Update();

	if (show_tracks)     cgvComputeHough(tcThreshMin, tcThreshMax, tcUseMaxThresh);
	if (show_xml_tracks) cgvDrawTracks();
}

void cgvDrawPalette(TBox *box[256], int palette)
{
	for (int i = 0; i < 256; i++)
	{
		box[i]->SetFillColor(palette+i);
		box[i]->Draw();
	}
}

void cgvDrawTracks()
{
	if (show_xml_tracks == false) return;

	unsigned int i;
	int j;
	float x,y,z;
	int cnt = 0;

	for (i = 0; i < vnseg.size(); i++)
	{
		if (fabs(vpt[i]) > track_thresh)
		{
			tracks.push_back(new TPolyLine3D(vnseg[i]));
			tracks[tracks.size()-1]->SetLineWidth(1.5);
			tracks[tracks.size()-1]->SetLineColor(kRed);

			for (j = 0; j < vnseg[i]; j++)
			{
				x = vsegx[cnt]*10.0;
				y = vsegy[cnt]*10.0;
				z = vsegz[cnt]*10.0;

				tracks[tracks.size()-1]->SetPoint(j, x,y,z);
				cnt++;
			}

			tracks[tracks.size()-1]->Draw();
		}
		else cnt += vnseg[i];
	}

	gPad->Update();
}

void cgvClearTracks()
{
	unsigned int i, size;

	size = tracks.size(); for (i = 0; i < size; i++) delete tracks[i]; tracks.clear();

	gPad->Update();
}

void cgvSetShowTracks(bool show)
{
	if (show == show_tracks) return;
	show_tracks = show;
	if (show_tracks)
		cgvComputeHough(tcThreshMin, tcThreshMax, tcUseMaxThresh);
	else
		cgvClearHough ();
}

void cgvSetShowXMLTracks(bool show)
{
	if (show == show_xml_tracks) return;
	show_xml_tracks = show;
	if (show_xml_tracks)
		cgvDrawTracks();
	else
		cgvClearTracks();
}

void cgvSetTrackThresh(float thresh)
{
	if (thresh == track_thresh) return;
	track_thresh = thresh;
	if (show_xml_tracks)
	{
		cgvClearTracks();
		 cgvDrawTracks();
	}
}

const char*  cgvGetFileName  (){return  filename.Data();}
unsigned int cgvGetFileIndex (){return       file_index;}
unsigned int cgvGetFileNumber(){return     flist.size();}
int          cgvGetRunNumber (){return          run_num;}
int          cgvGetEvNumber  (){return           ev_num;}
const char*  cgvGetEvTime    (){return   ev_time.Data();}
const char* cgvGetTriggerType(){return      triggerType;}
