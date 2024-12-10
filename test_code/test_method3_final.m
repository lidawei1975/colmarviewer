% load data10.mat
% 
% load data11.mat
% data=data(20:91);

load data1.mat


data=data';
n=length(data);

m=floor(n/2);

min_s=1e100;
for c1=5:m
    
    c2_start=m+1;
    if c2_start < c1+1;
        c2_start = c1+1;
    end

    for c2=c2_start:n-5

        x1=zeros(n,m);
        x2=zeros(n,m);
       
        x1(c1,m)=1;
        m1=min([m-1,c1-1,n-c1]);
        for i=1:m1
            x1(c1-i,m-i)=1;
            x1(c1+i,m-i)=1;
        end
        

        m1=min([m-1,c2-1,n-c2]);
        x2(c2,m)=1;
        for i=1:m1
            x2(c2-i,m-i)=1;
            x2(c2+i,m-i)=1;
        end
        
        
        x=[x1 x2]; 
        y=pinv(x)*data;
        
        pre1=x1*y(1:m);
        pre2=x2*y(m+1:m*2);
        pre=abs(pre1)+abs(pre2);
        e=pre-data;
        s=sqrt(mean(e.*e));
        
        if s<min_s
            min_s=s;
            c1_good=c1;
            c2_good=c2;
        end
    end
end

display(c1_good);
display(c2_good);

x1=zeros(n,m);
x2=zeros(n,m);

c1=c1_good;
c2=c2_good;
x1(c1,m)=1;
m1=min([m-1,c1-1,n-c1]);
for i=1:m1
    x1(c1-i,m-i)=1;
    x1(c1+i,m-i)=1;
end

m1=min([m-1,c2-1,n-c2]);
x2(c2,m)=1;
for i=1:m1
    x2(c2-i,m-i)=1;
    x2(c2+i,m-i)=1;
end

x=[x1 x2];
y=pinv(x)*data;

pre1=x1*y(1:m);
pre2=x2*y(m+1:m*2);
pre=x*y;


figure(2);
plot(1:n,data,'b-',1:n,pre1,'rs-',1:n,pre2,'mo-',1:n,pre,'kx');