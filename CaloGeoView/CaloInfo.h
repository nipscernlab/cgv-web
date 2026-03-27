#ifndef CALOINFO_H
#define CALOINFO_H

// interface functions ---------------------------------------------------------

void         cgvUpdatePickInfos();
float        cgvGetPickEnergy  ();
float        cgvGetPickEta     ();
float        cgvGetPickPhi     ();
const char*  cgvGetPickCalo    ();
int          cgvGetPickPMT1    ();
int          cgvGetPickPMT2    ();

#endif
