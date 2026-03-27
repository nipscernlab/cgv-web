#include <set>

#include "TString.h"
#include "TCanvas.h"
#include "TGLViewer.h"
#include "TGLPhysicalShape.h"
#include "TGLLogicalShape.h"
#include "TGraph.h"
#include <RQ_OBJECT.h>

#include "CaloInfo.h"
#include "CaloGeoConst.h"
#include "CaloGeoXML.h"
#include "CaloGeoInterface.h"

typedef std::set<TCanvas*>::iterator pickIter;
std::set<TCanvas*> pickCanvasArray;

class TPickCanvas;
TPickCanvas *curCanvas = NULL, *firstCanvas = NULL;

class TPickCanvas : public TCanvas
{
private:
	TPickCanvas* succ_;
	static TPickCanvas* marker_;
public:
	TPickCanvas(const char* name, const char* title, Int_t ww, Int_t wh) : TCanvas(name, title, ww, wh), succ_(NULL){}
	virtual ~TPickCanvas()
	{
		pickCanvasArray.erase(this);

		if(!marker_) marker_ = this;
		if(succ_ != marker_){delete succ_;}

		if(succ_ == marker_ || pickCanvasArray.empty())
		{
			marker_     = NULL;
			curCanvas   = NULL;
			firstCanvas = NULL;
		}
	}

	void setSucc(TPickCanvas* succ){succ_ = succ;}

	ClassDef(TPickCanvas, 1)
};

TPickCanvas* TPickCanvas::marker_ = NULL;

float  pick_ene  = 0.0;
float  pick_eta  = 0.0;
float  pick_phi  = 0.0;
int   *pick_adc1 =   0;
int   *pick_adc2 =   0;
int    pick_pmt1 =   0;
int    pick_pmt2 =   0;

TString pick_calo;
TString tile_cell;
TString tile_module;

void UpdatePickCaloInfo(int index)
{
	     if (index < NLAY_TILE                      ) pick_calo =     "Hadronic Tile Calorimeter";
	else if (index < NLAY_TILE + NLAY_HEC           ) pick_calo =  "Hadronic End Cap Calorimeter";
	else if (index < NLAY_TILE + NLAY_HEC + NLAY_LAR) pick_calo =  "EM (LArg) Barrel Calorimeter";
	else                                              pick_calo = "EM (LArg) End Cap Calorimeter";
}

void cgvUpdatePickInfos()
{
	gCanvas->cd();
	TGLViewer *v = (TGLViewer *)gPad->GetViewer3D();
	const TGLPhysicalShape *p = v->GetSelected();

	if (!p) return;

	//TObject *o = p->GetLogical().GetExternal();  // use this for ROOT 5.14
	  TObject *o = p->GetLogical()->GetExternal(); // or  this for ROOT 5.16

	int i, j, k, index = 0;

	for (i = 0; i < NLAYER; i++)
	{
		for (j = 0; j < eta_size[i]; j++)
		{
			for (k = 0; k < phi_size[i]; k++)
			{
				if (CaloLayerp[i][j][k] == o)
				{
					index = i;

					pick_ene  = energyp[i][j][k];
					pick_eta  =    etap[i][j][k];
					pick_phi  =    phip[i][j][k];
					pick_adc1 =   adc1p[i][j][k];
					pick_pmt1 = pmt1p[i][j][k];
					pick_pmt2 = pmt2p[i][j][k];
					if (i < 12)
					pick_adc2 =   adc2p[i][j][k];

					UpdatePickCaloInfo(i);
					break; break; break; // it does not work
				}
				if (CaloLayern[i][j][k] == o)
				{
					index = i;

					pick_ene = energyn[i][j][k];
					pick_eta =    etan[i][j][k];
					pick_phi =    phin[i][j][k];
					pick_adc1 =  adc1n[i][j][k];
					pick_pmt1 = pmt1n[i][j][k];
					pick_pmt2 = pmt2n[i][j][k];
					if (i < 12)
					pick_adc2 =  adc2n[i][j][k];

					UpdatePickCaloInfo(i);
					break; break; break;
				}
			}
		}
	}

	// Draw graphics -----------------------------------------------------------

	int size = 0;
	     if (index < NLAY_TILE           ) size = NSamp_til;
	else if (index < NLAY_TILE + NLAY_HEC) size = NSamp_hec;
	else if (index < NLAYER              ) size = NSamp_lar;

	if (size == 0) return;

	int *x = new int[size];
	for (int i = 0; i < size; i++) x[i] = i+1;

	TString id;
	id += index;
	id += pick_eta;
	id += pick_phi;
	
	if (index < 12)
	{
		TGraph *gr1 = new TGraph(size, x, pick_adc1);
		TGraph *gr2 = new TGraph(size, x, pick_adc2);
		gr1->SetTitle("PMT 1");
		gr2->SetTitle("PMT 2");
		gr1->SetMarkerStyle(21);
		gr2->SetMarkerStyle(21);
		gr1->SetMarkerSize(0.7);
		gr2->SetMarkerSize(0.7);

		TPickCanvas *c   = new TPickCanvas(id.Data(), pick_calo, 520, 260); c->Divide(2,1);
		pickCanvasArray.insert(c);
		c->setSucc(curCanvas);
		curCanvas = c;

		if(firstCanvas)
			firstCanvas->setSucc(curCanvas);
		else
			firstCanvas = curCanvas;

		c->cd(1); gPad->SetGrid(); gr1->Draw("AP");
		c->cd(2); gPad->SetGrid(); gr2->Draw("AP");
	}
	else
	{
		TGraph *gr1 = new TGraph(size, x, pick_adc1);
		gr1->SetMarkerStyle(21);
		gr1->SetMarkerSize(0.7);
		
		TPickCanvas *c  = new TPickCanvas(id.Data(), pick_calo, 260, 300);
		pickCanvasArray.insert(c);
		c->setSucc(curCanvas);
		curCanvas = c;

		if(firstCanvas)
			firstCanvas->setSucc(curCanvas);
		else
			firstCanvas = curCanvas;

		c->SetGrid();
		gr1->Draw("AP");
	}

	delete [] x;
}

float        cgvGetPickEnergy(){return pick_ene;        }
float        cgvGetPickEta   (){return pick_eta;        }
float        cgvGetPickPhi   (){return pick_phi;        }
const char*  cgvGetPickCalo  (){return pick_calo.Data();}
int          cgvGetPickPMT1  (){return pick_pmt1;       }
int          cgvGetPickPMT2  (){return pick_pmt2;       }
