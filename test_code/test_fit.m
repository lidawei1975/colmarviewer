y_good = pre1;

n=length(y_good);

y0=zeros(size(y_good));

y_good=y_good/max(y_good(:));

beta=[0.2,2,2,35,13,10,16,8];

% beta=[0.2,2,2,55,22,12,21,12];

f=@(beta)spe_from_j(beta,y_good);




beta = lsqnonlin(f,beta,[],[]);


z = spe_from_j(beta,y0);

figure(1);
plot(1:n,y_good,'b-',1:n,z,'rx-');